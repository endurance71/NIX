import type { ThemeColors } from '../theme/colors';

type AuthNavigationColors = Pick<ThemeColors, 'accent' | 'background' | 'label'>;

/**
 * Shared navigation chrome for secondary authentication screens.
 * Keeping this outside the layout makes the native header contract regression-testable.
 */
export function getAuthStackScreenOptions(colors: AuthNavigationColors) {
  return {
    headerShown: true,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerLargeTitle: false,
    headerTransparent: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.label },
    headerStyle: { backgroundColor: 'transparent' },
    contentStyle: { backgroundColor: colors.background },
  };
}
