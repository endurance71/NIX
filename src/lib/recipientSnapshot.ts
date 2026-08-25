import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FriendProfile } from '../services/friendService';

const PREFIX = 'nix.accepted-recipients.v1';

export type RecipientSnapshot = {
  version: 1;
  userId: string;
  writtenAt: string;
  recipients: FriendProfile[];
};

const keyFor = (userId: string) => `${PREFIX}.${userId}`;

function isFriendProfile(value: unknown): value is FriendProfile {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'username' in value && typeof value.username === 'string';
}

export async function readRecipientSnapshot(userId: string): Promise<RecipientSnapshot | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecipientSnapshot>;
    if (
      value.version !== 1 || value.userId !== userId || typeof value.writtenAt !== 'string'
      || !Array.isArray(value.recipients) || !value.recipients.every(isFriendProfile)
    ) {
      await AsyncStorage.removeItem(keyFor(userId));
      return null;
    }
    return value as RecipientSnapshot;
  } catch {
    await AsyncStorage.removeItem(keyFor(userId));
    return null;
  }
}

export async function writeRecipientSnapshot(userId: string, recipients: FriendProfile[]) {
  const snapshot: RecipientSnapshot = {
    version: 1,
    userId,
    writtenAt: new Date().toISOString(),
    recipients: recipients.map((recipient) => ({
      id: recipient.id,
      username: recipient.username,
      display_name: recipient.display_name ?? null,
      avatar_storage_path: recipient.avatar_storage_path ?? null,
      avatar_emoji: recipient.avatar_emoji ?? null,
    })),
  };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  return snapshot;
}

export async function clearRecipientSnapshot(userId: string) {
  await AsyncStorage.removeItem(keyFor(userId));
}
