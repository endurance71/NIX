import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function AuthLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitle: false,
        headerTransparent: false,
        headerShadowVisible: false,
        headerTintColor: colors.label,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t('auth.registerHeader') }} />
      <Stack.Screen name="check-email" options={{ title: t('auth.checkEmailTitle') }} />
      <Stack.Screen name="forgot-password" options={{ title: t('auth.forgotPasswordHeader') }} />
      <Stack.Screen name="reset-password" options={{ title: t('auth.resetPasswordHeader') }} />
      <Stack.Screen name="onboarding" options={{ title: t('auth.onboardingTitle') }} />
    </Stack>
  );
}
