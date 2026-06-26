import Stack from 'expo-router/stack';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../../theme/typography';

export default function InboxTabLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        headerTintColor: colors.label,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: 'transparent' },
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerTitleStyle: {
          color: colors.label,
          fontFamily: APP_FONT_FAMILY,
          fontWeight: '700',
        },
        headerLargeTitleStyle: {
          color: colors.label,
          fontFamily: APP_FONT_FAMILY,
          fontWeight: '700',
        },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
