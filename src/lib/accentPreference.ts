import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_PRESET_IDS,
  DEFAULT_ACCENT_PRESET_ID,
  type AccentPresetId,
} from '../theme/accent-presets';

const STORAGE_KEY = 'nix.accent_preset';

const presetIdSet = new Set<string>(ACCENT_PRESET_IDS);

export function normalizeAccentPresetId(value: unknown): AccentPresetId {
  if (typeof value === 'string' && presetIdSet.has(value)) {
    return value as AccentPresetId;
  }
  return DEFAULT_ACCENT_PRESET_ID;
}

export async function loadAccentPresetId(): Promise<AccentPresetId> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ACCENT_PRESET_ID;
    return normalizeAccentPresetId(raw);
  } catch {
    return DEFAULT_ACCENT_PRESET_ID;
  }
}

let accentPreload: Promise<AccentPresetId> | null = null;
let preloadedAccentPresetId: AccentPresetId | null = null;

/**
 * Starts reading the persisted accent once per app run (PERF-6) — call it at module load so it
 * runs in parallel with auth bootstrap — and remembers the result for synchronous reads.
 */
export function preloadAccentPresetId(): Promise<AccentPresetId> {
  accentPreload ??= loadAccentPresetId().then((id) => {
    preloadedAccentPresetId ??= id;
    return preloadedAccentPresetId;
  });
  return accentPreload;
}

/** The preloaded (or since saved) accent, or `null` while the first read is still pending. */
export function getPreloadedAccentPresetId(): AccentPresetId | null {
  return preloadedAccentPresetId;
}

export async function saveAccentPresetId(id: AccentPresetId): Promise<void> {
  preloadedAccentPresetId = normalizeAccentPresetId(id);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, normalizeAccentPresetId(id));
  } catch {
    /* ignoruj brak zapisu preferencji */
  }
}

/** Test-only: forget the module-level preload. */
export function resetAccentPreloadForTests() {
  accentPreload = null;
  preloadedAccentPresetId = null;
}
