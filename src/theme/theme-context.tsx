import { PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors } from './colors';
import { ThemeContext, type AppTheme } from './theme';

export function AppThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  /** Zgodnie z Expo / RN: tylko jawny `'dark'` → ciemny; `light` i `null` → jasny */
  const isDark = scheme === 'dark';

  const value: AppTheme = {
    colorScheme: isDark ? 'dark' : 'light',
    isDark,
    colors: isDark ? darkColors : lightColors,
    statusBarStyle: isDark ? 'light' : 'dark',
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
