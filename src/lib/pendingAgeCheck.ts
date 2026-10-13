import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGE_POLICY_VERSION } from './ageGate';

// Registration checks the age before the account exists, so it cannot record the attestation
// yet. It leaves this note (policy version only, never the date) for the first sign-in to record
// it, so the person is not asked for their birth date a second time.
const KEY_PREFIX = 'nix.pendingAgeCheck.';

function keyFor(email: string) {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`;
}

export async function rememberPassedAgeCheck(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(email), AGE_POLICY_VERSION);
  } catch {
    // Without the note the onboarding screen simply asks again.
  }
}

export async function hasPassedAgeCheck(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    return (await AsyncStorage.getItem(keyFor(email))) === AGE_POLICY_VERSION;
  } catch {
    return false;
  }
}

export async function forgetPassedAgeCheck(email: string | null | undefined): Promise<void> {
  if (!email) return;
  try {
    await AsyncStorage.removeItem(keyFor(email));
  } catch {
    // Harmless: the note only skips a question.
  }
}
