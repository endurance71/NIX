import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitle: true,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t('auth.registerTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="check-email" options={{ title: t('auth.checkEmailTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="forgot-password" options={{ title: t('auth.forgotPasswordTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="reset-password" options={{ title: t('auth.resetPasswordTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="onboarding" options={{ title: t('auth.onboardingTitle'), headerLargeTitle: false }} />
    </Stack>
  );
}
