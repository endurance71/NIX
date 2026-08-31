import { supabase } from '../lib/supabase';

export async function deleteCurrentAccount(input: { appleAuthorizationCode?: string | null } = {}) {
  const appleAuthorizationCode = input.appleAuthorizationCode;
  const body =
    typeof appleAuthorizationCode === 'string' && appleAuthorizationCode.length > 0
      ? { appleAuthorizationCode }
      : {};

  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('delete-account', {
    method: 'POST',
    body,
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Account deletion failed');
}
