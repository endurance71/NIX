import { Stack } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function AuthLayout() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitle: false,
        headerTitle: '',
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: colors.label,
        headerStyle: { backgroundColor: 'transparent' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" />
      <Stack.Screen name="check-email" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
