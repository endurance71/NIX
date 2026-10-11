import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The welcome tour (`/welcome`). The rule: sign in first, then the tour — it opens right after a
 * successful sign-in (or sign-up), once per account on this device.
 */
const SEEN_KEY_PREFIX = 'nix.welcome_seen_v2:';

/**
 * Whether to open the tour now. `signedInNow` is true right after a sign-in in this run (not a
 * restored session at launch). Storage failures never block the app with it.
 */
export async function shouldPresentWelcome(userId: string, signedInNow: boolean): Promise<boolean> {
  try {
    if (!signedInNow) return false;
    return (await AsyncStorage.getItem(SEEN_KEY_PREFIX + userId)) !== '1';
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(userId: string | null): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(SEEN_KEY_PREFIX + userId, '1');
  } catch {
    // Seen again after the next sign-in at worst.
  }
}
