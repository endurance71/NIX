import Stack from 'expo-router/stack';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function InboxTabLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        headerTintColor: colors.accent,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: 'transparent' },
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerTitleStyle: { color: colors.label },
        headerLargeTitleStyle: { color: colors.label },
        contentStyle: { backgroundColor: colors.systemBackground },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
