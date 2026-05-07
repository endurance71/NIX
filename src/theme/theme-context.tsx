import { createContext, PropsWithChildren, useMemo, use } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors } from './colors';

type AppTheme = {
  colorScheme: 'light' | 'dark';
  isDark: boolean;
  colors: typeof darkColors;
  statusBarStyle: 'light' | 'dark';
};

const ThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  /** Zgodnie z Expo / RN: tylko jawny `'dark'` → ciemny; `light` i `null` → jasny */
  const isDark = scheme === 'dark';

  const value = useMemo<AppTheme>(
    () => ({
      colorScheme: isDark ? 'dark' : 'light',
      isDark,
      colors: isDark ? darkColors : lightColors,
      statusBarStyle: isDark ? 'light' : 'dark',
    }),
    [isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within AppThemeProvider');
  }
  return context;
}
