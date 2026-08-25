import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Stack, router } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { AccentColorSwatch } from '../ui/accent-color-swatch';
import {
  NativeSettingsCenteredFooter,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../ui/native-settings';
import { SettingsListScreen } from '../ui/settings-list-screen';
import { iosRoadmapFeatures } from '../../config/iosRoadmapFeatures';
import { resolveAppIconName } from '../../theme/app-icons';
import { tap } from '../../lib/haptics';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();
  const { colors } = useAppTheme();
  const appVersion = Constants.expoConfig?.version ?? vm.t('common.unknown');
  const accountFooterLines = [
    vm.t('profile.creatorValue', { creator: 'MT HUB' }),
    vm.t('profile.appVersionValue', { version: appVersion }),
  ];

  useEffect(() => {
    return registerTabScrollToTop('profile', () => {
      router.replace('/(tabs)/profile');
    });
  }, []);

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={resolveAppIconName('qrcode')}
          accessibilityLabel={vm.t('profile.myQrCode')}
          onPress={() => {
            tap('light');
            router.push('/(tabs)/profile/my-code');
          }}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={resolveAppIconName('edit')}
          accessibilityLabel={vm.t('profile.editProfileA11y')}
          onPress={() => {
            tap('light');
            router.push('/(tabs)/profile/edit' as never);
          }}
        />
      </Stack.Toolbar>
      <SettingsListScreen loading={vm.profilePending} onRefresh={vm.handleListRefresh}>
        {/* Top Section: Identity & QR Code */}
        <NativeSettingsSection>
          <NativeSettingsRow
            title={vm.profileRow?.display_name || vm.t('profile.setDisplayName', 'Ustaw nazwę wyświetlaną')}
            supportingText={[
              `@${vm.profileUsername ?? vm.t('profile.missingUsername')}`,
              vm.profileRow?.bio?.trim(),
            ]
              .filter(Boolean)
              .join('\n')}
            avatar={{
              url: vm.avatarSignedUrl,
              storagePath: vm.profileRow?.avatar_storage_path ?? null,
              emoji: vm.profileRow?.avatar_emoji ?? null,
              fallbackInitial: vm.initialLetter,
              size: 60,
            }}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/edit' as never)}
            testID="profile-identity"
          />
        </NativeSettingsSection>

        {/* Social / Friends */}
        <NativeSettingsSection title={vm.t('profile.social', 'Społeczność')}>
          {iosRoadmapFeatures.activation &&
          !vm.activationState?.completed_at &&
          !vm.activationState?.dismissed_at ? (
            <NativeSettingsRow
              title={vm.t('activation.checklistTitle')}
              icon="checkCircle"
              iconColor={colors.accent}
              showsChevron
              onPress={() => router.push('/activation' as never)}
              testID="profile-activation"
            />
          ) : null}
          <NativeSettingsRow
            title={vm.t('profile.friendsTitle')}
            icon="friends"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/friends')}
            testID="profile-friends"
          />
        </NativeSettingsSection>

        {/* Compact settings hub */}
        <NativeSettingsSection title={vm.t('profile.settingsSectionTitle')}>
          <NativeSettingsRow
            title={vm.t('profile.appearanceTitle')}
            icon="paintpalette"
            iconColor={colors.accent}
            trailing={<AccentColorSwatch color={colors.accent} />}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/appearance')}
            testID="profile-appearance"
          />
          {Platform.OS === 'ios' && iosRoadmapFeatures.communicationControls ? (
            <NativeSettingsRow
              title={vm.t('notifications.title')}
              icon="notification"
              iconColor={colors.accent}
              showsChevron
              onPress={() => router.push('/(tabs)/profile/notifications' as never)}
              testID="profile-push-notifications"
            />
          ) : null}
          <NativeSettingsRow
            title={vm.t('profile.privacySectionTitle')}
            icon="privacySecurity"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/privacy-security' as never)}
            testID="profile-privacy-security"
          />
        </NativeSettingsSection>

        {/* Support & Legal */}
        <NativeSettingsSection title={vm.t('profile.supportSectionTitle', 'Pomoc i regulaminy')}>
          <NativeSettingsRow
            title={vm.t('profile.rateApp', 'Oceń aplikację')}
            icon="star"
            iconColor={colors.accent}
            onPress={() => void vm.handleRateApp()}
            testID="profile-rate-app"
          />
          <NativeSettingsRow
            title={vm.t('profile.contactSupport', 'Napisz do nas')}
            icon="email"
            iconColor={colors.accent}
            onPress={vm.handleSupport}
            testID="profile-support"
          />
          <NativeSettingsRow
            title={vm.t('profile.terms')}
            icon="document"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/terms')}
            testID="profile-terms"
          />
        </NativeSettingsSection>

        {/* Danger Zone */}
        <NativeSettingsSection title={vm.t('profile.accountActionsSectionTitle', 'Konto')}>
          <NativeSettingsRow
            title={vm.t('profile.signOut')}
            icon="signOut"
            role="destructive"
            onPress={() =>
              Alert.alert(
                vm.t('profile.signOutConfirmTitle'),
                vm.t('profile.signOutConfirmMessage'),
                [
                  { text: vm.t('common.cancel'), style: 'cancel' },
                  {
                    text: vm.t('profile.signOut'),
                    style: 'destructive',
                    onPress: () => void vm.handleSignOut(),
                  },
                ]
              )
            }
            testID="profile-sign-out"
          />
          <NativeSettingsRow
            title={vm.t('profile.deleteAccount', 'Usuń konto')}
            icon="trash"
            role="destructive"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/delete-account')}
            testID="profile-delete-account"
          />
        </NativeSettingsSection>

        <NativeSettingsCenteredFooter lines={accountFooterLines} />
      </SettingsListScreen>
      <Stack.Screen.Title large style={{ color: colors.label }} largeStyle={{ color: colors.label }}>
        {vm.t('profile.title')}
      </Stack.Screen.Title>
    </>
  );
}
