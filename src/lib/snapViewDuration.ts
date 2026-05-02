import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nix.snap_view_duration_sec';

/** Dozwolone wartości muszą być zgodne z CHECK w bazie (docs/supabase_setup.sql). */
export const SNAP_VIEW_DURATION_CHOICES = [5, 15, 30, 60, 180] as const;

export type SnapViewDurationSec = (typeof SNAP_VIEW_DURATION_CHOICES)[number];

export const DEFAULT_SNAP_VIEW_DURATION_SEC: SnapViewDurationSec = 5;

const choiceSet = new Set<number>(SNAP_VIEW_DURATION_CHOICES);

export function formatSnapViewDurationLabel(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec === 60) return '1 min';
  return `${sec / 60} min`;
}

/** Krótka etykieta na przycisku kamery. */
export function shortSnapViewDurationLabel(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec === 60) return '1m';
  return `${sec / 60}m`;
}

export function normalizeSnapViewDurationSec(value: unknown): SnapViewDurationSec {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  if (Number.isFinite(n) && choiceSet.has(n)) return n as SnapViewDurationSec;
  return DEFAULT_SNAP_VIEW_DURATION_SEC;
}

export async function loadPreferredSnapViewDuration(): Promise<SnapViewDurationSec> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SNAP_VIEW_DURATION_SEC;
    return normalizeSnapViewDurationSec(raw);
  } catch {
    return DEFAULT_SNAP_VIEW_DURATION_SEC;
  }
}

export async function savePreferredSnapViewDuration(sec: SnapViewDurationSec): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(sec));
  } catch {
    /* ignoruj brak zapisu preferencji */
  }
}
