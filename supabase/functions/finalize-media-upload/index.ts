import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, json } from '../_shared/http.ts';

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  }

  let payload: { batchId?: unknown; token?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON', code: 'INVALID_JSON' }, 400);
  }
  if (!isUuid(payload.batchId) || typeof payload.token !== 'string' || payload.token.length < 32) {
    return json({ error: 'INVALID_PAYLOAD', code: 'INVALID_PAYLOAD' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const tokenHash = await sha256Hex(payload.token);
  const { data, error } = await serviceClient.rpc('finalize_media_upload_batch', {
    p_batch_id: payload.batchId,
    p_finalize_token_hash: tokenHash,
  });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] ?? 'FINALIZE_FAILED';
    const status = code === 'BATCH_NOT_FOUND'
      ? 404
      : code === 'INVALID_FINALIZE_TOKEN'
        ? 403
        : ['OBJECT_NOT_FOUND', 'OBJECT_SIZE_MISMATCH', 'OBJECT_MIME_MISMATCH'].includes(code)
          ? 409
          : 400;
    return json({ error: error.message, code }, status);
  }

  if (data?.status === 'failed' && data?.assetId) {
    const { data: asset } = await serviceClient
      .from('media_assets')
      .select('storage_path')
      .eq('id', data.assetId)
      .maybeSingle();
    if (asset?.storage_path) {
      await serviceClient.storage.from('media-vault').remove([asset.storage_path]);
      await serviceClient
        .from('media_assets')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', data.assetId);
    }
  }

  return json({ ok: true, ...data });
});
