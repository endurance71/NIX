import { PropsWithChildren, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { loadAccentPresetId, saveAccentPresetId } from '../lib/accentPreference';
import {
  DEFAULT_ACCENT_PRESET_ID,
  resolveAccentColor,
  type AccentPresetId,
} from './accent-presets';
import { darkColors, lightColors } from './colors';
import { ThemeContext, type AppTheme } from './theme';

export function AppThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  /** Zgodnie z Expo / RN: tylko jawny `'dark'` → ciemny; `light` i `null` → jasny */
  const isDark = scheme === 'dark';
  const colorScheme: 'light' | 'dark' = isDark ? 'dark' : 'light';
  const [accentPresetId, setAccentPresetIdState] = useState<AccentPresetId>(DEFAULT_ACCENT_PRESET_ID);

  useEffect(() => {
    let cancelled = false;
    void loadAccentPresetId().then((id) => {
      if (!cancelled) setAccentPresetIdState(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAccentPresetId = (id: AccentPresetId) => {
    setAccentPresetIdState(id);
    void saveAccentPresetId(id);
  };

  const accent = resolveAccentColor(accentPresetId, colorScheme);
  const base = isDark ? darkColors : lightColors;
  const colors = {
    ...base,
    accent,
    systemBlue: accent,
    info: accent,
  };

  const value: AppTheme = {
    colorScheme,
    isDark,
    colors,
    statusBarStyle: isDark ? 'light' : 'dark',
    accentPresetId,
    setAccentPresetId,
  };

  const navigationTheme = {
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
  };

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
}
