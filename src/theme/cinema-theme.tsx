import { useMemo, type PropsWithChildren } from 'react';
import { resolveAccentColor, resolveAccentForeground, resolveOnAccentColor } from './accent-presets';
import { darkColors } from './colors';
import { ThemeContext, useThemeContext, type AppTheme } from './theme';

/**
 * Renders its subtree in the dark "cinema" palette whatever the system appearance (the camera,
 * viewer, welcome tour and login stage), keeping the user's accent. Components keep reading
 * `useAppTheme()`, so native controls and `@expo/ui` hosts turn dark too.
 */
export function CinemaThemeProvider({ children }: PropsWithChildren) {
  const parent = useThemeContext();
  const value = useMemo<AppTheme>(() => {
    const accent = resolveAccentColor(parent.accentPresetId, 'dark');
    const onAccent = resolveOnAccentColor(accent);
    return {
      ...parent,
      colorScheme: 'dark',
      isDark: true,
      statusBarStyle: 'light',
      colors: {
        ...darkColors,
        background: darkColors.cinemaBackground,
        accent,
        accentText: resolveAccentForeground(accent, darkColors.systemBackground),
        systemBlue: accent,
        info: accent,
        onAccent,
        onChatBubbleOwn: onAccent,
      },
    };
  }, [parent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
