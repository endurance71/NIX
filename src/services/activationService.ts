import { supabase } from '../lib/supabase';
import type { ActivationState } from '../types/database.types';

export async function getActivationState(): Promise<ActivationState> {
  const { data, error } = await supabase.rpc('get_user_activation_state');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    has_friend: row?.has_friend === true,
    has_sent_nix: row?.has_sent_nix === true,
    skipped_at: row?.skipped_at ?? null,
    dismissed_at: row?.dismissed_at ?? null,
    completed_at: row?.completed_at ?? null,
    last_shown_at: row?.last_shown_at ?? null,
  };
}

export async function updateActivationState(action: 'shown' | 'skip' | 'dismiss') {
  const { error } = await supabase.rpc('update_user_activation_state', {
    p_action: action,
  });
  if (error) throw error;
}
