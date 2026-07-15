import { supabase } from '../lib/supabase';

export async function deleteCurrentAccount() {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('delete-account', {
    method: 'POST',
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Account deletion failed');
}
