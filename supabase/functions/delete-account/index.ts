import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getBearerToken, json } from '../_shared/http.ts';
import { handleDeleteAccount, productionApple } from './handler.ts';
import type { AuthUser } from './identity.ts';
import {
  STORAGE_LIST_PAGE_SIZE,
  cleanupUserStorage,
  collectPagedRows,
  uniqueStoragePaths,
  type StoragePort,
} from './storage.ts';

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
      const nixRows = await collectPagedRows(async (offset, limit) => {
        const { data, error } = await serviceClient
          .from('nixes')
          .select('media_path')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('id', { ascending: true })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        return (data ?? []) as Array<{ media_path?: string | null }>;
      }, STORAGE_LIST_PAGE_SIZE);

      const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('avatar_storage_path')
        .eq('id', userId)
        .maybeSingle();
      if (profileError) throw profileError;

      const { data: paths, error: pathsError } = await serviceClient.rpc('delete_my_account_data', {
        p_user_id: userId,
      });
      if (pathsError) throw pathsError;

      const rpcRows = (paths ?? []) as Array<{ media_path?: string | null; avatar_path?: string | null }>;
      return {
        mediaPaths: uniqueStoragePaths([
          ...nixRows.map((row) => row.media_path),
          ...rpcRows.map((row) => row.media_path),
        ]),
        avatarPaths: uniqueStoragePaths([
          (profile as { avatar_storage_path?: string | null } | null)?.avatar_storage_path,
          ...rpcRows.map((row) => row.avatar_path),
        ]),
      };
    },
    cleanupStorage: async (userId, paths) => {
      await cleanupUserStorage(storage, userId, paths);
    },
    deleteAuthUser: async (userId) => {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    logError: logDeletionError,
  });
});
