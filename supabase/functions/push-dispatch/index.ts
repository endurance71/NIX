import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { json } from '../_shared/http.ts';
import {
  EXPO_PUSH_SEND_URL,
  expoHeaders,
  pushCopy,
  retryAt,
  type PushDevice,
  type PushJob,
} from '../_shared/push.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; details?: { error?: string } };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !expoAccessToken) return json({ error: 'Server is not configured' }, 500);
  if (!hasServiceRoleBearer(req, serviceRoleKey)) return json({ error: 'Unauthorized' }, 401);

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client.rpc('claim_push_notification_jobs', { p_limit: 10 });
  if (error) return json({ error: 'Could not claim push jobs' }, 500);
  const jobs = (data ?? []) as PushJob[];

  const markJob = async (job: PushJob, status: 'dispatched' | 'skipped' | 'failed', lastError: string | null) => {
    await client.from('push_notification_jobs').update({
      status,
      last_error: lastError,
      locked_at: null,
      next_attempt_at: status === 'failed' ? retryAt(job.attempts) : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
  };

  const isCurrent = async (job: PushJob) => {
    if (job.event_type === 'new_nix') {
      const { data: row } = await client.from('nixes').select('sender_id, receiver_id, status')
        .eq('id', job.entity_id).maybeSingle();
      return row?.sender_id === job.actor_id && row?.receiver_id === job.recipient_id && row?.status === 'sent';
    }
    const { data: row } = await client.from('friendships').select('user_id, friend_id, status')
      .eq('id', job.entity_id).maybeSingle();
    if (job.event_type === 'friend_request') {
      return row?.user_id === job.actor_id && row?.friend_id === job.recipient_id && row?.status === 'pending';
    }
    return row?.user_id === job.recipient_id && row?.friend_id === job.actor_id && row?.status === 'accepted';
  };

  const processJob = async (job: PushJob) => {
    try {
      if (!(await isCurrent(job))) {
        await markJob(job, 'skipped', 'stale_event');
        return;
      }
      const { data: blocks } = await client.from('user_blocks').select('blocker_id')
        .or(`and(blocker_id.eq.${job.recipient_id},blocked_id.eq.${job.actor_id}),and(blocker_id.eq.${job.actor_id},blocked_id.eq.${job.recipient_id})`)
        .limit(1);
      if (blocks?.length) {
        await markJob(job, 'skipped', 'blocked_relationship');
        return;
      }

      const [
        { data: actor },
        { data: deviceRows, error: devicesError },
        { data: completedDeliveries, error: deliveriesError },
      ] = await Promise.all([
        client.from('profiles').select('username').eq('id', job.actor_id).maybeSingle(),
        client.from('push_devices').select('id, expo_push_token, locale')
          .eq('user_id', job.recipient_id).eq('enabled', true),
        client.from('push_notification_deliveries').select('device_id,status')
          .eq('job_id', job.id).in('status', ['ticketed', 'delivered']),
      ]);
      if (devicesError) throw devicesError;
      if (deliveriesError) throw deliveriesError;
      const completedDeviceIds = new Set((completedDeliveries ?? []).map((row) => row.device_id));
      const devices = ((deviceRows ?? []) as PushDevice[]).filter((device) => !completedDeviceIds.has(device.id));
      if (!deviceRows?.length) {
        await markJob(job, 'skipped', 'no_active_devices');
        return;
      }
      if (!devices.length) {
        await markJob(job, 'dispatched', null);
        return;
      }

      const { count: unreadCount, error: unreadError } = await client
        .from('nixes')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', job.recipient_id)
        .eq('status', 'sent')
        .neq('is_viewed', true);
      if (unreadError) throw unreadError;
      const badge = unreadCount ?? 0;

      const username = actor?.username ?? 'nix_user';
      let retryableFailure: string | null = null;

      for (let offset = 0; offset < devices.length; offset += 100) {
        const batch = devices.slice(offset, offset + 100);
        const messages = batch.map((device) => ({
          to: device.expo_push_token,
          sound: 'default',
          badge,
          ...pushCopy(job.event_type, username, device.locale),
          data: { version: 1, type: job.event_type, entityId: job.entity_id, actorId: job.actor_id },
        }));
        const response = await fetch(EXPO_PUSH_SEND_URL, {
          method: 'POST',
          headers: expoHeaders(expoAccessToken),
          body: JSON.stringify(messages),
        });
        if (!response.ok) {
          retryableFailure = `expo_http_${response.status}`;
          await Promise.all(batch.map((device) => client.from('push_notification_deliveries').upsert({
            job_id: job.id,
            device_id: device.id,
            status: 'failed',
            error_code: retryableFailure,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'job_id,device_id' })));
          continue;
        }

        const payload = await response.json() as { data?: ExpoTicket[] };
        const tickets = Array.isArray(payload.data) ? payload.data : [];
        await Promise.all(batch.map(async (device, index) => {
          const ticket = tickets[index];
          if (ticket?.status === 'ok') {
            await client.from('push_notification_deliveries').upsert({
              job_id: job.id,
              device_id: device.id,
              expo_ticket_id: ticket.id,
              status: 'ticketed',
              error_code: null,
              ticket_received_at: new Date().toISOString(),
              next_receipt_check_at: new Date(Date.now() + 15 * 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'job_id,device_id' });
            return;
          }
          const errorCode = ticket?.status === 'error' ? ticket.details?.error ?? 'expo_ticket_error' : 'missing_ticket';
          if (errorCode === 'missing_ticket') retryableFailure = errorCode;
          await client.from('push_notification_deliveries').upsert({
            job_id: job.id,
            device_id: device.id,
            status: 'failed',
            error_code: errorCode,
            receipt_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'job_id,device_id' });
          if (errorCode === 'DeviceNotRegistered') {
            await client.from('push_devices').update({
              enabled: false,
              disabled_reason: 'DeviceNotRegistered',
              updated_at: new Date().toISOString(),
            }).eq('id', device.id);
          }
        }));
      }
      await markJob(job, retryableFailure ? 'failed' : 'dispatched', retryableFailure);
    } catch (error) {
      console.error('Push job failed', { jobId: job.id, eventType: job.event_type });
      await markJob(job, 'failed', error instanceof Error ? error.name : 'unknown_error');
    }
  };

  await Promise.all(jobs.map(processJob));
  return json({ ok: true, processed: jobs.length });
});
