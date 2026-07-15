import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json } from '../_shared/http.ts';
import {
  EXPO_PUSH_RECEIPTS_URL,
  expoHeaders,
} from '../_shared/push.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

type Delivery = {
  id: string;
  device_id: string;
  expo_ticket_id: string;
  ticket_received_at: string;
};

type ExpoReceipt = { status: 'ok' } | { status: 'error'; details?: { error?: string } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !expoAccessToken) return json({ error: 'Server is not configured' }, 500);
  if (!hasServiceRoleBearer(req, serviceRoleKey)) return json({ error: 'Unauthorized' }, 401);

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client.from('push_notification_deliveries')
    .select('id, device_id, expo_ticket_id, ticket_received_at')
    .eq('status', 'ticketed')
    .lte('next_receipt_check_at', new Date().toISOString())
    .order('next_receipt_check_at')
    .limit(1000);
  if (error) return json({ error: 'Could not load push receipts' }, 500);
  const deliveries = (data ?? []) as Delivery[];
  if (!deliveries.length) return json({ ok: true, processed: 0 });

  const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(expoAccessToken),
    body: JSON.stringify({ ids: deliveries.map((delivery) => delivery.expo_ticket_id) }),
  });
  if (!response.ok) return json({ error: `Expo receipts HTTP ${response.status}` }, 502);
  const payload = await response.json() as { data?: Record<string, ExpoReceipt> };
  const receipts = payload.data ?? {};
  const now = new Date();

  await Promise.all(deliveries.map(async (delivery) => {
    const receipt = receipts[delivery.expo_ticket_id];
    if (!receipt) {
      const ticketAge = now.getTime() - new Date(delivery.ticket_received_at).getTime();
      if (ticketAge >= 23 * 60 * 60_000) {
        await client.from('push_notification_deliveries').update({
          status: 'failed',
          error_code: 'receipt_missing',
          receipt_checked_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq('id', delivery.id);
      } else {
        await client.from('push_notification_deliveries').update({
          next_receipt_check_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
          updated_at: now.toISOString(),
        }).eq('id', delivery.id);
      }
      return;
    }
    if (receipt.status === 'ok') {
      await client.from('push_notification_deliveries').update({
        status: 'delivered',
        receipt_checked_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).eq('id', delivery.id);
      return;
    }
    const errorCode = receipt.details?.error ?? 'expo_receipt_error';
    await client.from('push_notification_deliveries').update({
      status: 'failed',
      error_code: errorCode,
      receipt_checked_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', delivery.id);
    if (errorCode === 'DeviceNotRegistered') {
      await client.from('push_devices').update({
        enabled: false,
        disabled_reason: 'DeviceNotRegistered',
        updated_at: now.toISOString(),
      }).eq('id', delivery.device_id);
    }
  }));

  return json({ ok: true, processed: deliveries.length });
});
