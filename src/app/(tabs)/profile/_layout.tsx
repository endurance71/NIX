import Stack from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function ProfileTabLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitle: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: 'transparent' },
        headerLargeStyle: { backgroundColor: 'transparent' },
        title: t('profile.title'),
      }}>
      <Stack.Screen name="index" />
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
