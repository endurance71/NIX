import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request) {
  const value = req.headers.get('Authorization') ?? req.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

async function removePrefix(
  client: ReturnType<typeof createClient>,
  bucket: 'avatars' | 'media-vault',
  prefix: string
) {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  if (!data?.length) return;

  const files = data.filter((item) => item.id).map((item) => `${prefix}/${item.name}`);
  const directories = data.filter((item) => !item.id).map((item) => `${prefix}/${item.name}`);

  if (files.length) {
    const { error: removeError } = await client.storage.from(bucket).remove(files);
    if (removeError) throw removeError;
  }
  await Promise.all(directories.map((directory) => removePrefix(client, bucket, directory)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = getBearerToken(req);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  if (!token) return json({ error: 'Missing bearer token' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  try {
    const { data: paths, error: pathsError } = await serviceClient.rpc('delete_my_account_data', {
      p_user_id: user.id,
    });
    if (pathsError) throw pathsError;

    // All uploaded Nix media is owned by its sender and stored below nixes/<uid>.
    // Avatars are stored below <uid>. The explicit path list also supports legacy
    // paths and media received from another user.
    await removePrefix(serviceClient, 'media-vault', `nixes/${user.id}`);
    await removePrefix(serviceClient, 'avatars', user.id);
    const mediaPaths = (paths ?? [])
      .map((row: { media_path?: string | null }) => row.media_path)
      .filter((path): path is string => Boolean(path));
    if (mediaPaths.length) {
      const { error: mediaError } = await serviceClient.storage.from('media-vault').remove(mediaPaths);
      if (mediaError) throw mediaError;
    }
    const legacyAvatarPaths = (paths ?? [])
      .map((row: { avatar_path?: string | null }) => row.avatar_path)
      .filter((path): path is string => Boolean(path));
    if (legacyAvatarPaths.length) {
      const { error: avatarError } = await serviceClient.storage.from('avatars').remove(legacyAvatarPaths);
      if (avatarError) throw avatarError;
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return json({ ok: true });
  } catch (error) {
    console.error('Account deletion failed', error);
    return json({ error: 'Account deletion could not be completed. Please try again.' }, 500);
  }
});
