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
    .select('id, media_path')
    .or(
      `and(sender_id.eq.${userData.user.id},receiver_id.eq.${payload.blockedUserId}),and(sender_id.eq.${payload.blockedUserId},receiver_id.eq.${userData.user.id})`
    );
  if (messageError) return json({ error: 'Block was saved, but conversation cleanup failed' }, 500);

  const mediaPaths = (messages ?? []).flatMap((row) => row.media_path ? [row.media_path] : []);
  if (mediaPaths.length) {
    const { error: storageError } = await serviceClient.storage.from('media-vault').remove(mediaPaths);
    if (storageError) return json({ error: 'Block was saved, but media cleanup failed' }, 500);
  }
  if (messages?.length) {
    const ids = messages.map((row) => row.id);
    const { error: deleteError } = await serviceClient.from('nixes').delete().in('id', ids);
    if (deleteError) return json({ error: 'Block was saved, but conversation cleanup failed' }, 500);
  }

  return json({ ok: true });
});
