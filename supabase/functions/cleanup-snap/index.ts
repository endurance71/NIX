import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isValidCleanupPayload, type CleanupPayload } from './cleanup-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isMissingStatusColumnError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  return message.includes('column snaps.status does not exist') || message.includes("Could not find the 'status' column");
}

async function auditCleanup(
  serviceClient: ReturnType<typeof createClient>,
  status: 'queued' | 'success' | 'failed' | 'not_found' | 'forbidden',
  snapId: string,
  receiverId: string,
  mediaPath: string,
  errorMessage?: string
) {
  await serviceClient.rpc('log_cleanup_audit', {
    p_snap_id: snapId,
    p_receiver_id: receiverId,
    p_media_path: mediaPath,
    p_status: status,
    p_error_message: errorMessage ?? null,
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: CleanupPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!isValidCleanupPayload(payload)) {
    return new Response(JSON.stringify({ error: 'snapId and mediaPath are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const snapId = payload.snapId as string;
  const mediaPath = payload.mediaPath as string;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized user' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: snap, error: snapError } = await serviceClient
    .from('snaps')
    .select('id, receiver_id, media_path, is_viewed')
    .eq('id', snapId)
    .maybeSingle();

  if (snapError) {
    return new Response(JSON.stringify({ error: snapError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!snap) {
    await serviceClient.from('snap_cleanup_queue').delete().eq('snap_id', snapId);
    await auditCleanup(serviceClient, 'not_found', snapId, user.id, mediaPath);
    return new Response(JSON.stringify({ ok: true, deleted: false, reason: 'snap_not_found' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (snap.receiver_id !== user.id) {
    await auditCleanup(serviceClient, 'forbidden', snapId, user.id, mediaPath, 'forbidden_receiver_mismatch');
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (snap.media_path !== mediaPath) {
    await auditCleanup(serviceClient, 'failed', snapId, user.id, mediaPath, 'media_path_mismatch');
    return new Response(JSON.stringify({ error: 'mediaPath mismatch' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!snap.is_viewed) {
    const { error: viewedUpdateError } = await serviceClient
      .from('snaps')
      .update({ is_viewed: true, viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('id', snapId);
    if (viewedUpdateError && isMissingStatusColumnError(viewedUpdateError)) {
      await serviceClient
        .from('snaps')
        .update({ is_viewed: true, viewed_at: new Date().toISOString() })
        .eq('id', snapId);
    }
  }

  const { error: storageError } = await serviceClient.storage.from('media-vault').remove([mediaPath]);
  if (storageError) {
    const { error: statusError } = await serviceClient
      .from('snaps')
      .update({ status: 'cleanup_failed' })
      .eq('id', snapId);
    if (statusError && isMissingStatusColumnError(statusError)) {
      // Starszy schemat nie ma kolumny status — pomijamy oznaczenie.
    }

    await serviceClient
      .from('snap_cleanup_queue')
      .upsert({
        snap_id: snapId,
        receiver_id: user.id,
        media_path: mediaPath,
        attempt_count: 1,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: storageError.message,
        updated_at: new Date().toISOString(),
      });
    await auditCleanup(serviceClient, 'failed', snapId, user.id, mediaPath, storageError.message);
    return new Response(JSON.stringify({ error: storageError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: updateSnapError } = await serviceClient
    .from('snaps')
    .update({ status: 'cleaned', cleaned_at: new Date().toISOString() })
    .eq('id', snapId);
  if (updateSnapError && isMissingStatusColumnError(updateSnapError)) {
    const { error: legacyUpdateError } = await serviceClient
      .from('snaps')
      .update({ is_viewed: true, viewed_at: new Date().toISOString() })
      .eq('id', snapId);
    if (!legacyUpdateError) {
      await serviceClient.from('snap_cleanup_queue').delete().eq('snap_id', snapId);
      await auditCleanup(serviceClient, 'success', snapId, user.id, mediaPath);
      return new Response(JSON.stringify({ ok: true, deleted: false, archived: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (updateSnapError) {
    await serviceClient
      .from('snap_cleanup_queue')
      .upsert({
        snap_id: snapId,
        receiver_id: user.id,
        media_path: mediaPath,
        attempt_count: 1,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: updateSnapError.message,
        updated_at: new Date().toISOString(),
      });
    await auditCleanup(serviceClient, 'failed', snapId, user.id, mediaPath, updateSnapError.message);
    return new Response(JSON.stringify({ error: updateSnapError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await serviceClient.from('snap_cleanup_queue').delete().eq('snap_id', snapId);
  await auditCleanup(serviceClient, 'success', snapId, user.id, mediaPath);

  return new Response(JSON.stringify({ ok: true, deleted: false, archived: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
