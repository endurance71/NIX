import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { getAuthStackScreenOptions } from '../../lib/authNavigation';

export default function AuthLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={getAuthStackScreenOptions(colors)}
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
