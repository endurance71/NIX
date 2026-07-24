import Stack from 'expo-router/stack';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../../hooks/useAppTheme';

export default function ProfileTabLayout() {
  const { t } = useTranslation();
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
        headerTitleStyle: {
          color: colors.label,
        },
        headerLargeTitleStyle: {
          color: colors.label,
        },
        contentStyle: { backgroundColor: colors.background },
        title: t('profile.title'),
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="friends"
        options={{
          title: t('profile.friendsTitle'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="my-code"
        options={{
          title: t('profile.myQrCode'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="safety"
        options={{
          title: t('profile.safetyCenter'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="appearance"
        options={{
          title: t('profile.appearanceTitle'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="change-password"
        options={{
          title: t('profile.changePassword'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="delete-account"
        options={{
          title: t('profile.deleteAccount'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="privacy-policy"
        options={{
          title: t('profile.privacyPolicy'),
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="terms"
        options={{
          title: t('profile.terms'),
          headerLargeTitle: false,
        }}
      />
    </Stack>
  );
}
