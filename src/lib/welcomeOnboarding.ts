import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The welcome tour (`/welcome`): first-launch state plus the owner's test switch.
 *
 * While the tour is being designed it does not show on first launch for everyone yet
 * (`WELCOME_ON_FIRST_LAUNCH`); the owner's account and the simulator get a profile switch that
 * shows it on every launch.
 */
export const WELCOME_ON_FIRST_LAUNCH = false;

const SEEN_KEY = 'nix.welcome_seen_v1';
const ALWAYS_SHOW_KEY = 'nix.welcome_always_show';

/** The app owner's account, which gets the test switch on a real device. */
const WELCOME_TESTER_USERNAMES: ReadonlySet<string> = new Set(['endurance71']);

export function canTestWelcome(username: string | null | undefined, isDevice: boolean): boolean {
  if (!isDevice) return true;
  return username != null && WELCOME_TESTER_USERNAMES.has(username.replace(/^@/, '').toLowerCase());
}

export async function loadWelcomeAlwaysShow(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ALWAYS_SHOW_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveWelcomeAlwaysShow(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ALWAYS_SHOW_KEY, value ? '1' : '0');
}

/** Whether this launch opens with the tour. Storage failures never block the app with it. */
export async function shouldPresentWelcome(): Promise<boolean> {
  try {
    const [[, seen], [, always]] = await AsyncStorage.multiGet([SEEN_KEY, ALWAYS_SHOW_KEY]);
    if (always === '1') return true;
    return WELCOME_ON_FIRST_LAUNCH && seen !== '1';
  } catch {
    return false;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Seen again next launch at worst.
  }
}
