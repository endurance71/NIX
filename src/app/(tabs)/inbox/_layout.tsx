import Stack from 'expo-router/stack';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function InboxTabLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: false,
        headerTintColor: colors.label,
        headerTransparent: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.systemBackground },
        contentStyle: { backgroundColor: colors.systemBackground },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
