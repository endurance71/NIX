import Stack from 'expo-router/stack';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useAuth } from '../../../hooks/useAuth';

export default function InboxTabLayout() {
  const { colors } = useAppTheme();
  const { isOfflineAuthenticated } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitle: true,
        headerTintColor: colors.accent,
        headerTransparent: !isOfflineAuthenticated,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: isOfflineAuthenticated ? colors.background : 'transparent' },
        headerLargeStyle: { backgroundColor: isOfflineAuthenticated ? colors.background : 'transparent' },
        headerTitleStyle: { color: colors.label },
        headerLargeTitleStyle: { color: colors.label },
        contentStyle: { backgroundColor: colors.systemBackground },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
