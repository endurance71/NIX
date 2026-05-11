import { supabase } from '../lib/supabase';
import { getCurrentUser } from './profileService';

export type CapturePolicy = 'deny' | 'allow';

type CapturePolicyRow = {
  friend_user_id: string;
  capture_policy: CapturePolicy;
};

function normalizeCapturePolicy(value: unknown): CapturePolicy {
  return value === 'allow' ? 'allow' : 'deny';
}

function mapCapturePolicyErrorMessage(error: unknown) {
  const rawMessage =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : null;
  return rawMessage ?? 'Nie udało się zapisać ustawienia ochrony.';
}

function toFriendlyError(error: unknown) {
  return new Error(mapCapturePolicyErrorMessage(error));
}

export async function listCapturePoliciesForFriends(friendIds: string[]): Promise<Record<string, CapturePolicy>> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const normalizedIds = Array.from(
    new Set(friendIds.flatMap((id) => {
      const trimmed = id.trim();
      return trimmed ? [trimmed] : [];
    }))
  );
  if (normalizedIds.length === 0) return {};

  const { data, error } = await supabase
    .from('nix_capture_prefs')
    .select('friend_user_id, capture_policy')
    .eq('owner_user_id', user.id)
    .in('friend_user_id', normalizedIds);

  if (error) throw toFriendlyError(error);

  const result: Record<string, CapturePolicy> = {};
  for (const id of normalizedIds) result[id] = 'deny';
  for (const row of (data ?? []) as CapturePolicyRow[]) {
    result[row.friend_user_id] = normalizeCapturePolicy(row.capture_policy);
  }
  return result;
}

export async function upsertCapturePolicyForFriend(friendId: string, capturePolicy: CapturePolicy): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Brak sesji. Zaloguj się ponownie.');

  const normalizedFriendId = friendId.trim();
  if (!normalizedFriendId || normalizedFriendId === user.id) {
    throw new Error('Nieprawidłowy identyfikator znajomego.');
  }

  const { error } = await supabase.from('nix_capture_prefs').upsert(
    {
      owner_user_id: user.id,
      friend_user_id: normalizedFriendId,
      capture_policy: capturePolicy,
    },
    { onConflict: 'owner_user_id,friend_user_id' }
  );

  if (error) throw toFriendlyError(error);
}

export async function getCapturePolicyForSender(senderId: string): Promise<CapturePolicy> {
  const normalizedSenderId = senderId.trim();
  if (!normalizedSenderId) return 'deny';

  const { data, error } = await supabase.rpc('get_capture_policy_for_sender', { sender_id: normalizedSenderId });
  if (error) throw toFriendlyError(error);

  return normalizeCapturePolicy(data);
}
