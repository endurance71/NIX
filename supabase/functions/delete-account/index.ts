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
  const removePrefix = async (
    bucket: 'avatars' | 'media-vault',
    prefix: string
  ): Promise<void> => {
    const { data, error } = await serviceClient.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) return;

    const files: string[] = [];
    const directories: string[] = [];
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else directories.push(path);
    }

    if (files.length) {
      const { error: removeError } = await serviceClient.storage.from(bucket).remove(files);
      if (removeError) throw removeError;
    }
    await Promise.all(directories.map((directory) => removePrefix(bucket, directory)));
  };

  try {
    const { data: paths, error: pathsError } = await serviceClient.rpc('delete_my_account_data', {
      p_user_id: user.id,
    });
    if (pathsError) throw pathsError;

    // All uploaded Nix media is owned by its sender and stored below nixes/<uid>.
    // Avatars are stored below <uid>. The explicit path list also supports legacy
    // paths and media received from another user.
    await removePrefix('media-vault', `nixes/${user.id}`);
    await removePrefix('avatars', user.id);
    const mediaPaths: string[] = [];
    const legacyAvatarPaths: string[] = [];
    for (const row of paths ?? []) {
      const candidate = row as {
        media_path?: string | null;
        avatar_path?: string | null;
      };
      if (candidate.media_path) mediaPaths.push(candidate.media_path);
      if (candidate.avatar_path) legacyAvatarPaths.push(candidate.avatar_path);
    }
    if (mediaPaths.length) {
      const { error: mediaError } = await serviceClient.storage.from('media-vault').remove(mediaPaths);
      if (mediaError) throw mediaError;
    }
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
