import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';

export default function AuthLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitle: true,
        headerTintColor: colors.label,
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
        headerStyle: { backgroundColor: colors.background },
        headerLargeStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen
        name="register"
        options={{
          title: t('auth.registerTitle'),
          headerLargeTitle: false,
          headerTransparent: true,
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerLargeStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="check-email" options={{ title: t('auth.checkEmailTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="forgot-password" options={{ title: t('auth.forgotPasswordTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="reset-password" options={{ title: t('auth.resetPasswordTitle'), headerLargeTitle: false }} />
      <Stack.Screen name="onboarding" options={{ title: t('auth.onboardingTitle'), headerLargeTitle: false }} />
    </Stack>
  );
}
