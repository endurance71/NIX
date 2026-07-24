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

export async function saveAccentPresetId(id: AccentPresetId): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, normalizeAccentPresetId(id));
  } catch {
    /* ignoruj brak zapisu preferencji */
  }
}
