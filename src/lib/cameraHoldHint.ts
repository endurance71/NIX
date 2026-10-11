import AsyncStorage from '@react-native-async-storage/async-storage';

/** One-time "Hold to record" hint: shown on the first few camera launches. */
const STORAGE_KEY = 'nix.camera_hold_hint_count';

/** How many launches show the hint before it retires on its own. */
export const HOLD_HINT_MAX_SHOWS = 3;

export function normalizeHoldHintCount(raw: unknown): number {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : typeof raw === 'number' ? raw : 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), HOLD_HINT_MAX_SHOWS);
}

export function shouldShowHoldHint(count: number): boolean {
  return normalizeHoldHintCount(count) < HOLD_HINT_MAX_SHOWS;
}

/**
 * Next stored count: a launch that shows the hint uses one show; dismissing it or recording a video
 * (the user has learned the gesture) retires it for good.
 */
export function nextHoldHintCount(count: number, event: 'shown' | 'dismissed' | 'recorded'): number {
  if (event === 'shown') return Math.min(normalizeHoldHintCount(count) + 1, HOLD_HINT_MAX_SHOWS);
  return HOLD_HINT_MAX_SHOWS;
}

export async function loadHoldHintCount(): Promise<number> {
  try {
    return normalizeHoldHintCount(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    // Unreadable storage: do not nag with a hint we cannot retire.
    return HOLD_HINT_MAX_SHOWS;
  }
}

export async function saveHoldHintCount(count: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(normalizeHoldHintCount(count)));
  } catch {
    /* a lost write only means one more hint */
  }
}
