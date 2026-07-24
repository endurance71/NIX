import { createContext, use } from 'react';
import { darkColors } from './colors';
import type { AccentPresetId } from './accent-presets';

export type AppTheme = {
  colorScheme: 'light' | 'dark';
  isDark: boolean;
  colors: typeof darkColors;
  statusBarStyle: 'light' | 'dark';
  accentPresetId: AccentPresetId;
  setAccentPresetId: (id: AccentPresetId) => void;
};

export const ThemeContext = createContext<AppTheme | null>(null);

export function useThemeContext() {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within AppThemeProvider');
  }
  return context;
}
