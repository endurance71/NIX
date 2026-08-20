import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGE_POLICY_VERSION } from './ageGate';

const PREFIX = 'nix.profile-bootstrap.v1';

export type ProfileBootstrapSnapshot = {
  userId: string;
  profileComplete: true;
  agePolicyVersion: string;
  verifiedAt: string;
};

const keyFor = (userId: string) => `${PREFIX}.${userId}`;

export async function readProfileBootstrapSnapshot(userId: string): Promise<ProfileBootstrapSnapshot | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProfileBootstrapSnapshot>;
    if (value.userId !== userId || value.profileComplete !== true || value.agePolicyVersion !== AGE_POLICY_VERSION || typeof value.verifiedAt !== 'string') {
      await AsyncStorage.removeItem(keyFor(userId));
      return null;
    }
    return value as ProfileBootstrapSnapshot;
  } catch {
    await AsyncStorage.removeItem(keyFor(userId));
    return null;
  }
}

export async function writeProfileBootstrapSnapshot(userId: string): Promise<ProfileBootstrapSnapshot> {
  const snapshot: ProfileBootstrapSnapshot = {
    userId,
    profileComplete: true,
    agePolicyVersion: AGE_POLICY_VERSION,
    verifiedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  return snapshot;
}

export async function clearProfileBootstrapSnapshot(userId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(userId));
}
