import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  applyConversationPin,
  isMissingTableError,
  localPinsMissingOnServer,
  normalizeConversationPins,
  parseStoredConversationPins,
  type ConversationPin,
} from '../lib/conversationPins';
import { activeConversationMutePeerIds, type ConversationMuteEntry } from '../lib/inboxRowMenu';

const PINS_TABLE = 'conversation_pins';
const pinsStorageKey = (userId: string) => `nix.conversation_pins.v1.${userId}`;
const pinsSyncedKey = (userId: string) => `nix.conversation_pins.synced.v1.${userId}`;

async function readLocalPins(userId: string): Promise<ConversationPin[]> {
  try {
    return parseStoredConversationPins(await AsyncStorage.getItem(pinsStorageKey(userId)));
  } catch {
    return [];
  }
}

async function writeLocalPins(userId: string, pins: readonly ConversationPin[]): Promise<void> {
  try {
    await AsyncStorage.setItem(pinsStorageKey(userId), JSON.stringify(pins));
  } catch {
    /* the mirror is a convenience; the server copy (when deployed) stays authoritative */
  }
}

async function wasSynced(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(pinsSyncedKey(userId))) === '1';
  } catch {
    return false;
  }
}

async function markSynced(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(pinsSyncedKey(userId), '1');
  } catch {
    /* retried on the next read */
  }
}

/**
 * Pins for the inbox. Server first (synced across devices); falls back to the device mirror when
 * the backend has no `conversation_pins` table yet or the request fails (offline). Pins made on a
 * backend without the table are uploaded once, the first time the table is available.
 */
export async function listConversationPins(userId: string): Promise<ConversationPin[]> {
  if (!userId) return [];
  const [localPins, { data, error }] = await Promise.all([
    readLocalPins(userId),
    supabase.from(PINS_TABLE).select('peer_id,pinned_at').order('pinned_at', { ascending: true }),
  ]);
  if (error) {
    if (!isMissingTableError(error, PINS_TABLE)) {
      console.warn('Could not load conversation pins; using the device copy', error);
    }
    return localPins;
  }

  let serverPins = normalizeConversationPins(
    (data ?? []).map((row) => ({ peerId: row.peer_id, pinnedAt: row.pinned_at })),
  );
  if (!(await wasSynced(userId))) {
    const missing = localPinsMissingOnServer(serverPins, localPins);
    if (missing.length > 0) {
      const { error: uploadError } = await supabase.from(PINS_TABLE).upsert(
        missing.map((pin) => ({ user_id: userId, peer_id: pin.peerId, pinned_at: pin.pinnedAt })),
        { onConflict: 'user_id,peer_id', ignoreDuplicates: true },
      );
      if (uploadError) {
        console.warn('Could not upload device pins', uploadError);
        return normalizeConversationPins([...serverPins, ...missing]);
      }
      serverPins = normalizeConversationPins([...serverPins, ...missing]);
    }
    await markSynced(userId);
  }
  await writeLocalPins(userId, serverPins);
  return serverPins;
}

/**
 * Pins or unpins one conversation: server write first (skipped when the table is not deployed),
 * then the device mirror. A real server failure throws so the caller can roll back its cache.
 */
export async function setConversationPinned(
  userId: string,
  peerId: string,
  pinned: boolean,
  currentPins: readonly ConversationPin[],
): Promise<ConversationPin[]> {
  const nowIso = new Date().toISOString();
  const nextPins = applyConversationPin(currentPins, peerId, pinned, nowIso);
  const pinnedAt = nextPins.find((pin) => pin.peerId === peerId)?.pinnedAt ?? nowIso;

  const { error } = pinned
    ? await supabase
        .from(PINS_TABLE)
        .upsert(
          { user_id: userId, peer_id: peerId, pinned_at: pinnedAt },
          { onConflict: 'user_id,peer_id', ignoreDuplicates: true },
        )
    : await supabase.from(PINS_TABLE).delete().eq('user_id', userId).eq('peer_id', peerId);

  if (error && !isMissingTableError(error, PINS_TABLE)) throw error;
  await writeLocalPins(userId, nextPins);
  return nextPins;
}

/** Peers whose conversation is muted right now (expired mutes are dropped). */
export async function listActiveConversationMutes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('conversation_mutes')
    .select('peer_user_id,muted_until');
  if (error) throw error;
  return activeConversationMutePeerIds((data ?? []) as ConversationMuteEntry[], Date.now());
}
