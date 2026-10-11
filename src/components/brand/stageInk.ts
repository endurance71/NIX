import { useMemo } from 'react';
import { useAppTheme } from '../../hooks/useAppTheme';
import { darkColors } from '../../theme/colors';

/**
 * Colours for the welcome and login stages, light or dark with the system. Keeps the
 * `cinema*` names the scenes were written with, mapped onto the current appearance.
 */
export function useStageInk() {
  const { colors, isDark } = useAppTheme();
  return useMemo(
    () => ({
      ...colors,
      cinemaBackground: colors.background,
      cinemaSecondaryLabel: colors.secondaryLabel,
      cinemaTrack: isDark ? darkColors.cinemaTrack : colors.separator,
      // Cards and option rows: raised from the background in both appearances.
      secondarySystemBackground: isDark ? colors.secondarySystemBackground : colors.secondarySystemGroupedBackground,
    }),
    [colors, isDark],
  );
}
