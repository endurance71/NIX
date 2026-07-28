import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = getBearerToken(req);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  if (!token) return json({ error: 'Missing bearer token' }, 401);

  let payload: { blockedUserId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }
  if (!payload.blockedUserId) return json({ error: 'blockedUserId is required' }, 400);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);
  if (payload.blockedUserId === userData.user.id) return json({ error: 'Cannot block yourself' }, 400);

  const { error: blockError } = await authClient.rpc('block_user', {
    p_blocked_user_id: payload.blockedUserId,
  });
  if (blockError) return json({ error: blockError.message }, 400);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: messages, error: messageError } = await serviceClient
    .from('nixes')
    .select('id, media_path, asset_id')
    .or(
      `and(sender_id.eq.${userData.user.id},receiver_id.eq.${payload.blockedUserId}),and(sender_id.eq.${payload.blockedUserId},receiver_id.eq.${userData.user.id})`
    );
  if (messageError) return json({ error: 'Block was saved, but conversation cleanup failed' }, 500);

  const legacyMessages = (messages ?? []).filter((row) => !row.asset_id);
  const legacyPaths = legacyMessages.flatMap((row) => row.media_path ? [row.media_path] : []);
  if (legacyPaths.length) {
    const { error: storageError } = await serviceClient.storage.from('media-vault').remove(legacyPaths);
    if (storageError) return json({ error: 'Block was saved, but media cleanup failed' }, 500);
  }
  if (legacyMessages.length) {
    const ids = legacyMessages.map((row) => row.id);
    const { error: deleteError } = await serviceClient.from('nixes').delete().in('id', ids);
    if (deleteError) return json({ error: 'Block was saved, but conversation cleanup failed' }, 500);
  }

  const { data: sharedCleanup, error: sharedCleanupError } = await serviceClient.rpc(
    'archive_blocked_shared_media',
    {
      p_user_a: userData.user.id,
      p_user_b: payload.blockedUserId,
    }
  );
  if (sharedCleanupError) {
    return json({ error: 'Block was saved, but shared media cleanup failed' }, 500);
  }
  const sharedRows = Array.isArray(sharedCleanup) ? sharedCleanup : [];
  const sharedPaths = Array.from(new Set(sharedRows.flatMap((row) =>
    typeof row?.storage_path === 'string' ? [row.storage_path] : []
  )));
  if (sharedPaths.length) {
    const { error: storageError } = await serviceClient.storage
      .from('media-vault')
      .remove(sharedPaths);
    if (storageError) {
      // Assets already have status=deleting; the hourly orphan sweeper will
      // retry physical deletion without affecting remaining recipients.
      return json({ error: 'Block was saved, but shared media cleanup was deferred' }, 500);
    }
    const assetIds = sharedRows.flatMap((row) =>
      typeof row?.asset_id === 'string' ? [row.asset_id] : []
    );
    if (assetIds.length) {
      await serviceClient
        .from('media_assets')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .in('id', assetIds);
    }
  }

  await serviceClient
    .from('text_messages')
    .delete()
    .or(
      `and(sender_id.eq.${userData.user.id},receiver_id.eq.${payload.blockedUserId}),and(sender_id.eq.${payload.blockedUserId},receiver_id.eq.${userData.user.id})`
    );

  return json({ ok: true });
});
