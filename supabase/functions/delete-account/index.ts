import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';
import { handleDeleteAccount, productionApple } from './handler.ts';
import type { AuthUser } from './identity.ts';
import { emptyStoragePrefix, type StoragePort } from './storage.ts';

function logDeletionError(category: string) {
  console.error('Account deletion failed', { category });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = getBearerToken(req);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500);
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const storage: StoragePort = {
    list: async (bucket, prefix, page) => {
      const { data, error } = await serviceClient.storage.from(bucket).list(prefix, page);
      if (error) throw error;
      return data ?? [];
    },
    remove: async (bucket, paths) => {
      if (!paths.length) return;
      const { error } = await serviceClient.storage.from(bucket).remove(paths);
      if (error) throw error;
    },
  };

  return handleDeleteAccount(req, {
    getUser: async (accessToken): Promise<AuthUser | null> => {
      const {
        data: { user },
        error,
      } = await authClient.auth.getUser(accessToken);
      if (error || !user) return null;
      return {
        id: user.id,
        identities: user.identities ?? [],
        app_metadata: user.app_metadata ?? {},
      };
    },
    readAppleSecrets: productionApple.readAppleSecrets,
    createClientSecret: productionApple.createClientSecret,
    exchangeCode: productionApple.exchangeCode,
    fetchJwks: productionApple.fetchJwks,
    verifyIdToken: productionApple.verifyIdToken,
    revokeToken: productionApple.revokeToken,
    cleanupDatabase: async (userId) => {
      const { data: paths, error: pathsError } = await serviceClient.rpc('delete_my_account_data', {
        p_user_id: userId,
      });
      if (pathsError) throw pathsError;
      const mediaPaths: string[] = [];
      const avatarPaths: string[] = [];
      for (const row of (paths ?? []) as Array<{ media_path?: string | null; avatar_path?: string | null }>) {
        if (row.media_path) mediaPaths.push(row.media_path);
        if (row.avatar_path) avatarPaths.push(row.avatar_path);
      }
      return { mediaPaths, avatarPaths };
    },
    cleanupStorage: async (userId, paths) => {
      await emptyStoragePrefix(storage, 'media-vault', `nixes/${userId}`);
      await emptyStoragePrefix(storage, 'avatars', userId);
      if (paths.mediaPaths.length) {
        const { error } = await serviceClient.storage.from('media-vault').remove(paths.mediaPaths);
        if (error) throw error;
      }
      if (paths.avatarPaths.length) {
        const { error } = await serviceClient.storage.from('avatars').remove(paths.avatarPaths);
        if (error) throw error;
      }
    },
    deleteAuthUser: async (userId) => {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    logError: logDeletionError,
  });
});
