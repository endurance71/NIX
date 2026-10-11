import {
  createContext,
  PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import {
  getPreloadedAccentPresetId,
  preloadAccentPresetId,
  saveAccentPresetId,
} from '../lib/accentPreference';
import {
  DEFAULT_ACCENT_PRESET_ID,
  resolveAccentColor,
  resolveAccentForeground,
  resolveOnAccentColor,
  type AccentPresetId,
} from './accent-presets';
import { darkColors, lightColors } from './colors';
import { ThemeContext, type AppTheme } from './theme';

// PERF-6: read the persisted accent at module load, in parallel with auth bootstrap, so the first
// visible frame already has it (the splash waits for `useAccentPreferenceReady`).
void preloadAccentPresetId();

/** Upper bound on how long a slow storage read may hold the splash. */
const ACCENT_SPLASH_TIMEOUT_MS = 400;

const AccentReadyContext = createContext(true);

/** `true` once the persisted accent is applied (or its read timed out); gates the splash. */
export function useAccentPreferenceReady() {
  return use(AccentReadyContext);
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  /** Zgodnie z Expo / RN: tylko jawny `'dark'` → ciemny; `light` i `null` → jasny */
  const isDark = scheme === 'dark';
  const colorScheme: 'light' | 'dark' = isDark ? 'dark' : 'light';
  const [accentPresetId, setAccentPresetIdState] = useState<AccentPresetId>(
    () => getPreloadedAccentPresetId() ?? DEFAULT_ACCENT_PRESET_ID
  );
  const [accentReady, setAccentReady] = useState(() => getPreloadedAccentPresetId() !== null);
  const accentChosenByUserRef = useRef(false);

  useEffect(() => {
    // Even when the read finished between render and this effect, the `then` below applies it
    // (state setters bail out when nothing changed).
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setAccentReady(true);
    }, ACCENT_SPLASH_TIMEOUT_MS);
    void preloadAccentPresetId().then((id) => {
      if (cancelled) return;
      clearTimeout(timeout);
      // One render applies the accent and releases the splash together.
      if (!accentChosenByUserRef.current) setAccentPresetIdState(id);
      setAccentReady(true);
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const setAccentPresetId = useCallback((id: AccentPresetId) => {
    accentChosenByUserRef.current = true;
    setAccentPresetIdState(id);
    void saveAccentPresetId(id);
  }, []);

  const accent = resolveAccentColor(accentPresetId, colorScheme);
  const base = isDark ? darkColors : lightColors;
  const colors = useMemo(() => {
    // Readable ink on accent fills (dark on orange/teal), also for own chat bubbles.
    const onAccent = resolveOnAccentColor(accent);
    return {
      ...base,
      accent,
      // Text/glyphs on the background: a darker orange/teal in light mode (WCAG ≥ 4.5:1).
      accentText: resolveAccentForeground(accent, base.systemBackground),
      systemBlue: accent,
      info: accent,
      onAccent,
      onChatBubbleOwn: onAccent,
    };
  }, [accent, base]);

  const value = useMemo<AppTheme>(() => ({
    colorScheme,
    isDark,
    colors,
    statusBarStyle: isDark ? 'light' : 'dark',
    accentPresetId,
    setAccentPresetId,
  }), [accentPresetId, colorScheme, colors, isDark, setAccentPresetId]);

  const navigationTheme = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: accent,
      background: colors.background,
      card: colors.secondarySystemGroupedBackground,
      text: colors.label,
      border: colors.separator,
      notification: colors.error,
    },
  }), [accent, colors.background, colors.error, colors.label, colors.secondarySystemGroupedBackground, colors.separator, isDark]);

  return (
    <AccentReadyContext value={accentReady}>
      <ThemeContext.Provider value={value}>
        <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>
      </ThemeContext.Provider>
    </AccentReadyContext>
  );
}
