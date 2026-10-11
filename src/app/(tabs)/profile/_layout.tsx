import Stack from 'expo-router/stack';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useAuth } from '../../../hooks/useAuth';
import { APP_FONT_FAMILY } from '../../../theme/typography';
import { SOFT_SCROLL_EDGE_EFFECTS } from '../../../theme/scrollEdge';

export default function ProfileTabLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { isOfflineAuthenticated } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitleEnabled: true,
        headerTintColor: colors.accentText,
        headerTransparent: !isOfflineAuthenticated,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: isOfflineAuthenticated ? colors.background : 'transparent' },
        headerLargeStyle: { backgroundColor: isOfflineAuthenticated ? colors.background : 'transparent' },
        // Same rounded face as the rest of the app (root stack headers use it too).
        headerTitleStyle: {
          fontFamily: APP_FONT_FAMILY,
          fontWeight: '700',
          color: colors.label,
        },
        headerLargeTitleStyle: {
          fontFamily: APP_FONT_FAMILY,
          fontWeight: '700',
          color: colors.label,
        },
        contentStyle: { backgroundColor: colors.background },
        scrollEdgeEffects: SOFT_SCROLL_EDGE_EFFECTS,
        title: t('profile.title'),
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="edit"
        options={{
          title: t('profile.editProfile'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="friends"
        options={{
          title: t('profile.friendsTitle'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="my-code"
        options={{
          title: t('profile.myQrCode'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="memories"
        options={{
          title: t('memories.title'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="safety"
        options={{
          title: t('profile.safetyCenterSummary'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="appearance"
        options={{
          title: t('profile.appearanceTitle'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="privacy-security"
        options={{
          title: t('profile.privacySectionTitle'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="devices"
        options={{
          title: t('devices.title'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: t('notifications.title'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="data-export"
        options={{
          title: t('dataExport.title'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="change-password"
        options={{
          title: t('profile.changePassword'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="delete-account"
        options={{
          title: t('profile.deleteAccount'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="privacy-policy"
        options={{
          title: t('profile.privacyPolicy'),
          headerLargeTitleEnabled: false,
        }}
      />
      <Stack.Screen
        name="terms"
        options={{
          title: t('profile.terms'),
          headerLargeTitleEnabled: false,
        }}
      />
    </Stack>
  );
}
