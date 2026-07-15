import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
  return message.includes('column nixes.status does not exist') || message.includes("Could not find the 'status' column");
}

async function auditCleanup(
  serviceClient: SupabaseClient<any, any, any, any, any>,
  status: 'queued' | 'success' | 'failed' | 'not_found' | 'forbidden',
  nixId: string,
  receiverId: string,
  mediaPath: string,
  errorMessage?: string
) {
  await serviceClient.rpc('log_cleanup_audit', {
    p_nix_id: nixId,
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
    return new Response(JSON.stringify({ error: 'nixId and mediaPath are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const nixId = payload.nixId as string;
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

  const { data: nix, error: nixError } = await serviceClient
    .from('nixes')
    .select('id, receiver_id, media_path, is_viewed')
    .eq('id', nixId)
    .maybeSingle();

  if (nixError) {
    return new Response(JSON.stringify({ error: nixError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!nix) {
    await serviceClient.from('nix_cleanup_queue').delete().eq('nix_id', nixId);
    await auditCleanup(serviceClient, 'not_found', nixId, user.id, mediaPath);
    return new Response(JSON.stringify({ ok: true, deleted: false, reason: 'nix_not_found' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (nix.receiver_id !== user.id) {
    await auditCleanup(serviceClient, 'forbidden', nixId, user.id, mediaPath, 'forbidden_receiver_mismatch');
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (nix.media_path !== mediaPath) {
    await auditCleanup(serviceClient, 'failed', nixId, user.id, mediaPath, 'media_path_mismatch');
    return new Response(JSON.stringify({ error: 'mediaPath mismatch' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!nix.is_viewed) {
    const { error: viewedUpdateError } = await serviceClient
      .from('nixes')
      .update({ is_viewed: true, viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('id', nixId);
    if (viewedUpdateError && isMissingStatusColumnError(viewedUpdateError)) {
      await serviceClient
        .from('nixes')
        .update({ is_viewed: true, viewed_at: new Date().toISOString() })
        .eq('id', nixId);
    }
  }

  const { error: storageError } = await serviceClient.storage.from('media-vault').remove([mediaPath]);
  if (storageError) {
    const { error: statusError } = await serviceClient
      .from('nixes')
      .update({ status: 'cleanup_failed' })
      .eq('id', nixId);
    if (statusError && isMissingStatusColumnError(statusError)) {
      // Starszy schemat nie ma kolumny status — pomijamy oznaczenie.
    }

    await serviceClient
      .from('nix_cleanup_queue')
      .upsert({
        nix_id: nixId,
        receiver_id: user.id,
        media_path: mediaPath,
        attempt_count: 1,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: storageError.message,
        updated_at: new Date().toISOString(),
      });
    await auditCleanup(serviceClient, 'failed', nixId, user.id, mediaPath, storageError.message);
    return new Response(JSON.stringify({ error: storageError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: updateNixError } = await serviceClient
    .from('nixes')
    .update({ status: 'cleaned', cleaned_at: new Date().toISOString() })
    .eq('id', nixId);
  if (updateNixError && isMissingStatusColumnError(updateNixError)) {
    const { error: legacyUpdateError } = await serviceClient
      .from('nixes')
      .update({ is_viewed: true, viewed_at: new Date().toISOString() })
      .eq('id', nixId);
    if (!legacyUpdateError) {
      await serviceClient.from('nix_cleanup_queue').delete().eq('nix_id', nixId);
      await auditCleanup(serviceClient, 'success', nixId, user.id, mediaPath);
      return new Response(JSON.stringify({ ok: true, deleted: false, archived: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  if (updateNixError) {
    await serviceClient
      .from('nix_cleanup_queue')
      .upsert({
        nix_id: nixId,
        receiver_id: user.id,
        media_path: mediaPath,
        attempt_count: 1,
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        last_error: updateNixError.message,
        updated_at: new Date().toISOString(),
      });
    await auditCleanup(serviceClient, 'failed', nixId, user.id, mediaPath, updateNixError.message);
    return new Response(JSON.stringify({ error: updateNixError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await serviceClient.from('nix_cleanup_queue').delete().eq('nix_id', nixId);
  await auditCleanup(serviceClient, 'success', nixId, user.id, mediaPath);

  return new Response(JSON.stringify({ ok: true, deleted: false, archived: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
