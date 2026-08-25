import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGE_POLICY_VERSION } from './ageGate';
import type { CurrentUserProfileRow } from '../services/profileService';

const PREFIX = 'nix.profile-bootstrap.v3';
const LEGACY_V2_PREFIX = 'nix.profile-bootstrap.v2';
const LEGACY_V1_PREFIX = 'nix.profile-bootstrap.v1';

export type ProfileBootstrapSnapshot = {
  userId: string;
  profileComplete: true;
  agePolicyVersion: string;
  verifiedAt: string;
  profile: CurrentUserProfileRow;
};

const keyFor = (userId: string) => `${PREFIX}.${userId}`;

export async function readProfileBootstrapSnapshot(userId: string): Promise<ProfileBootstrapSnapshot | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) {
    const legacyV2Key = `${LEGACY_V2_PREFIX}.${userId}`;
    const legacyV1Key = `${LEGACY_V1_PREFIX}.${userId}`;
    const legacyRaw = await AsyncStorage.getItem(legacyV2Key)
      ?? await AsyncStorage.getItem(legacyV1Key);
    if (!legacyRaw) return null;
    try {
      const legacy = JSON.parse(legacyRaw) as Partial<ProfileBootstrapSnapshot>;
      if (
        legacy.userId !== userId || legacy.profileComplete !== true ||
        legacy.agePolicyVersion !== AGE_POLICY_VERSION || typeof legacy.verifiedAt !== 'string'
      ) return null;
      const migrated: ProfileBootstrapSnapshot = {
        userId,
        profileComplete: true,
        agePolicyVersion: AGE_POLICY_VERSION,
        verifiedAt: legacy.verifiedAt,
        profile: {
          id: userId,
          username: legacy.profile?.username ?? null,
          display_name: legacy.profile?.display_name ?? null,
          bio: null,
          is_private: false,
          avatar_storage_path: legacy.profile?.avatar_storage_path ?? null,
          avatar_emoji: legacy.profile?.avatar_emoji ?? null,
        },
      };
      await AsyncStorage.setItem(keyFor(userId), JSON.stringify(migrated));
      await Promise.all([
        AsyncStorage.removeItem(legacyV2Key),
        AsyncStorage.removeItem(legacyV1Key),
      ]);
      return migrated;
    } catch {
      return null;
    }
  }
  try {
    const value = JSON.parse(raw) as Partial<ProfileBootstrapSnapshot>;
    if (value.userId !== userId || value.profileComplete !== true || value.agePolicyVersion !== AGE_POLICY_VERSION || typeof value.verifiedAt !== 'string' || !value.profile) {
      await AsyncStorage.removeItem(keyFor(userId));
      return null;
    }
    return value as ProfileBootstrapSnapshot;
  } catch {
    await AsyncStorage.removeItem(keyFor(userId));
    return null;
  }
}

export async function writeProfileBootstrapSnapshot(
  userId: string,
  profile: CurrentUserProfileRow
): Promise<ProfileBootstrapSnapshot> {
  const snapshot: ProfileBootstrapSnapshot = {
    userId,
    profileComplete: true,
    agePolicyVersion: AGE_POLICY_VERSION,
    verifiedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      is_private: profile.is_private,
      avatar_storage_path: profile.avatar_storage_path,
      avatar_emoji: profile.avatar_emoji,
    },
  };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  return snapshot;
}

export async function clearProfileBootstrapSnapshot(userId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(keyFor(userId)),
    AsyncStorage.removeItem(`${LEGACY_V2_PREFIX}.${userId}`),
    AsyncStorage.removeItem(`${LEGACY_V1_PREFIX}.${userId}`),
  ]);
}
