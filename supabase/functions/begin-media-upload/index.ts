import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';

type RecipientInput = {
  receiverId: string;
  viewDurationSec: number;
  sequenceIndex?: number;
};

type BeginPayload = {
  idempotencyKey: string;
  mediaType: 'image' | 'video';
  contentType: string;
  sizeBytes: number;
  fileExtension: string;
  playbackDurationMs?: number | null;
  thumbnailB64?: string | null;
  recipients: RecipientInput[];
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPayload(value: unknown): value is BeginPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<BeginPayload>;
  return typeof payload.idempotencyKey === 'string'
    && payload.idempotencyKey.length >= 8
    && (payload.mediaType === 'image' || payload.mediaType === 'video')
    && typeof payload.contentType === 'string'
    && (
      payload.mediaType === 'image'
        ? ['image/jpeg', 'image/png', 'image/webp'].includes(payload.contentType.toLowerCase())
        : ['video/mp4', 'video/quicktime', 'video/x-m4v'].includes(payload.contentType.toLowerCase())
    )
    && Number.isFinite(payload.sizeBytes)
    && (payload.sizeBytes ?? 0) > 0
    && (payload.sizeBytes ?? 0) <= (
      payload.mediaType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    )
    && typeof payload.fileExtension === 'string'
    && (
      payload.thumbnailB64 === undefined
      || payload.thumbnailB64 === null
      || (
        typeof payload.thumbnailB64 === 'string'
        && payload.thumbnailB64.length <= 70_000
        && payload.thumbnailB64.startsWith('data:image/jpeg;base64,')
      )
    )
    && Array.isArray(payload.recipients)
    && payload.recipients.length >= 1
    && payload.recipients.length <= 50
    && payload.recipients.every((recipient) =>
      isUuid(recipient?.receiverId)
      && [0, 5, 15, 30, 60, 180].includes(recipient.viewDurationSec)
      && (recipient.sequenceIndex === undefined
        || (Number.isInteger(recipient.sequenceIndex) && recipient.sequenceIndex >= 0))
    );
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deriveFinalizeToken(secret: string, userId: string, idempotencyKey: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`media-finalize:v1:${userId}:${idempotencyKey}`)
  );
  return base64Url(new Uint8Array(signature));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const bearerToken = getBearerToken(req);
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  }
  if (!bearerToken) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);

  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return json({ error: 'INVALID_JSON', code: 'INVALID_JSON' }, 400);
  }
  if (!isPayload(rawPayload)) return json({ error: 'INVALID_PAYLOAD', code: 'INVALID_PAYLOAD' }, 400);
  const payload = rawPayload;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);

  // Stable per sender/idempotency key so a retried begin request returns the
  // same batch-scoped capability even when the first response was lost.
  const finalizeToken = await deriveFinalizeToken(
    serviceRoleKey,
    userData.user.id,
    payload.idempotencyKey
  );
  const finalizeTokenHash = await sha256Hex(finalizeToken);

  const { data, error } = await authClient.rpc('begin_media_upload_batch', {
    p_idempotency_key: payload.idempotencyKey,
    p_finalize_token_hash: finalizeTokenHash,
    p_media_type: payload.mediaType,
    p_content_type: payload.contentType,
    p_size_bytes: Math.round(payload.sizeBytes),
    p_file_extension: payload.fileExtension,
    p_playback_duration_ms: payload.playbackDurationMs == null
      ? null
      : Math.round(payload.playbackDurationMs),
    p_thumbnail_b64: payload.thumbnailB64 ?? null,
    p_recipients: payload.recipients,
  });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] ?? 'BEGIN_UPLOAD_FAILED';
    const status = code === 'RATE_LIMITED' ? 429 : code === 'AUTH_REQUIRED' ? 401 : 400;
    return json({ error: error.message, code }, status);
  }

  const batch = Array.isArray(data) ? data[0] : data;
  if (!batch?.batch_id || !batch?.storage_path) {
    return json({ error: 'INVALID_BEGIN_RESPONSE', code: 'INVALID_BEGIN_RESPONSE' }, 500);
  }

  const { data: signed, error: signedError } = await serviceClient.storage
    .from('media-vault')
    .createSignedUploadUrl(batch.storage_path, { upsert: false });
  if (signedError || !signed?.signedUrl) {
    return json({
      error: signedError?.message ?? 'SIGNED_UPLOAD_FAILED',
      code: 'SIGNED_UPLOAD_FAILED',
    }, 500);
  }

  const finalizeUrl = `${supabaseUrl}/functions/v1/finalize-media-upload`;
  return json({
    batchId: batch.batch_id,
    assetId: batch.asset_id,
    storagePath: batch.storage_path,
    status: batch.batch_status,
    upload: {
      url: signed.signedUrl,
      method: 'PUT',
      headers: {
        'content-type': payload.contentType,
        'cache-control': 'max-age=3600',
        'x-upsert': 'false',
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
    finalize: {
      url: finalizeUrl,
      token: finalizeToken,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json',
      },
    },
    retentionExpiresAt: batch.expires_at,
  });
});
