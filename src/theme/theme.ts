import { createContext, use } from 'react';
import { darkColors } from './colors';

export type AppTheme = {
  colorScheme: 'light' | 'dark';
  isDark: boolean;
  colors: typeof darkColors;
  statusBarStyle: 'light' | 'dark';
};

export const ThemeContext = createContext<AppTheme | null>(null);

export function useThemeContext() {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within AppThemeProvider');
  }
  return context;
}
