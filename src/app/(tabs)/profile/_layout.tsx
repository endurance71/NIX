import Stack from 'expo-router/stack';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../../theme/typography';

export default function ProfileTabLayout() {
  const { t } = useTranslation();
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
        title: t('profile.title'),
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="my-code"
        options={{
          title: t('profile.myQrCode'),
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
        name="remove-friend"
        options={{
          title: t('profile.removeFriendTitle'),
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="remove-avatar"
        options={{
          title: t('profile.removeAvatarTitle'),
          presentation: 'formSheet',
          headerShown: false,
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
