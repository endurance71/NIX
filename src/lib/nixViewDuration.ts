import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nix.nix_view_duration_sec';

/** Dozwolone wartości muszą być zgodne z CHECK w bazie (docs/supabase_setup.sql). */
export const NIX_VIEW_DURATION_CHOICES = [5, 15, 30, 60, 180] as const;

export type NixViewDurationSec = (typeof NIX_VIEW_DURATION_CHOICES)[number];

export const DEFAULT_NIX_VIEW_DURATION_SEC: NixViewDurationSec = 5;

const choiceSet = new Set<number>(NIX_VIEW_DURATION_CHOICES);

export function formatNixViewDurationLabel(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec === 60) return '1 min';
  return `${sec / 60} min`;
}

/** Krótka etykieta na przycisku kamery. */
export function shortNixViewDurationLabel(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec === 60) return '1m';
  return `${sec / 60}m`;
}

export function normalizeNixViewDurationSec(value: unknown): NixViewDurationSec {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  if (Number.isFinite(n) && choiceSet.has(n)) return n as NixViewDurationSec;
  return DEFAULT_NIX_VIEW_DURATION_SEC;
}

export async function loadPreferredNixViewDuration(): Promise<NixViewDurationSec> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NIX_VIEW_DURATION_SEC;
    return normalizeNixViewDurationSec(raw);
  } catch {
    return DEFAULT_NIX_VIEW_DURATION_SEC;
  }
}

export async function savePreferredNixViewDuration(sec: NixViewDurationSec): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(sec));
  } catch {
    /* ignoruj brak zapisu preferencji */
  }
}
