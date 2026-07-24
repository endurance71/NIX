import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Stack, router } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { HeaderQrButton } from '../navigation/header-qr-button';
import {
  NativeSettingsCenteredFooter,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../ui/native-settings';
import { SettingsListScreen } from '../ui/settings-list-screen';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();
  const { colors, accentPresetId } = useAppTheme();
  const appVersion = Constants.expoConfig?.version ?? vm.t('common.unknown');
  const socialSummary =
    vm.pendingInviteCount > 0
      ? vm.t('profile.socialSummaryPendingInvites', { count: vm.pendingInviteCount })
      : undefined;
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
      <Stack.Screen
        options={{
          headerRight: () => <HeaderQrButton />,
        }}
      />
      <SettingsListScreen loading={vm.profilePending} onRefresh={vm.handleListRefresh}>
        {/* Top Section: Identity & QR Code */}
        <NativeSettingsSection>
          <NativeSettingsRow
            title={vm.profileRow?.display_name || vm.t('profile.setDisplayName', 'Ustaw nazwę wyświetlaną')}
            supportingText={`@${vm.profileUsername ?? vm.t('profile.missingUsername')}`}
            avatar={{
              url: vm.avatarSignedUrl,
              storagePath: vm.profileRow?.avatar_storage_path ?? null,
              emoji: vm.profileRow?.avatar_emoji ?? null,
              fallbackInitial: vm.initialLetter,
              size: 60,
            }}
            onPress={vm.handleEditDisplayName}
            testID="profile-identity"
          />
        </NativeSettingsSection>

        {/* Social / Friends */}
        <NativeSettingsSection title={vm.t('profile.social', 'Społeczność')}>
          <NativeSettingsRow
            title={vm.t('profile.friendsTitle')}
            supportingText={socialSummary}
            icon="profile"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/friends')}
            testID="profile-friends"
          />
        </NativeSettingsSection>

        {/* Appearance */}
        <NativeSettingsSection title={vm.t('profile.appearanceSectionTitle')}>
          <NativeSettingsRow
            title={vm.t('profile.accentColor')}
            supportingText={vm.t(`profile.accentPresets.${accentPresetId}`)}
            icon="paintpalette"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/appearance')}
            testID="profile-appearance"
          />
        </NativeSettingsSection>

        {/* Privacy & Account Config */}
        <NativeSettingsSection title={vm.t('profile.privacySectionTitle', 'Prywatność i bezpieczeństwo')}>
          {vm.canChangePassword ? (
            <NativeSettingsRow
              title={vm.t('profile.changePassword')}
              icon="key"
              iconColor={colors.accent}
              showsChevron
              onPress={() => router.push('/(tabs)/profile/change-password')}
              testID="profile-change-password"
            />
          ) : null}
          <NativeSettingsRow
            title={vm.t('profile.privateAccount', 'Konto prywatne')}
            icon="lock"
            iconColor={colors.accent}
            switchValue={vm.profileRow?.is_private ?? false}
            onSwitchValueChange={(val) => void vm.handleTogglePrivacy(val)}
            testID="profile-private-account"
          />
          <NativeSettingsRow
            title={vm.t('profile.safetyCenter')}
            icon="shield"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/safety')}
            testID="profile-safety"
          />
          {Platform.OS === 'ios' ? (
            <NativeSettingsRow
              title={vm.t('profile.notifications', 'Powiadomienia')}
              icon="notification"
              iconColor={colors.accent}
              switchValue={vm.pushNotificationsEnabled}
              onSwitchValueChange={(enabled) => void vm.handlePushToggle(enabled)}
              disabled={vm.pushNotificationsBusy}
              testID="profile-push-notifications"
            />
          ) : null}
        </NativeSettingsSection>

        {/* Avatar Config */}
        <NativeSettingsSection title={vm.t('profile.avatarSectionTitle', 'Awatar')}>
          <NativeSettingsRow
            title={vm.avatarBusy ? vm.t('profile.changeAvatarLoading') : vm.t('profile.changeAvatar')}
            icon="photoLibrary"
            iconColor={colors.accent}
            disabled={vm.avatarBusy}
            onPress={() => void vm.handlePickAvatarPhoto()}
            testID="profile-change-avatar"
          />
          {vm.hasAvatar ? (
            <NativeSettingsRow
              title={vm.t('profile.removeAvatar')}
              icon="trash"
              iconColor={colors.accent}
              disabled={vm.avatarBusy}
              onPress={() =>
                Alert.alert(
                  vm.t('profile.removeAvatarConfirmTitle'),
                  vm.t('profile.removeAvatarConfirmMessage'),
                  [
                    { text: vm.t('common.cancel'), style: 'cancel' },
                    {
                      text: vm.t('profile.removeAvatar'),
                      style: 'destructive',
                      onPress: () => void vm.handleRemoveAvatar(),
                    },
                  ]
                )
              }
              testID="profile-remove-avatar"
            />
          ) : null}
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
            title={vm.t('profile.privacyPolicy')}
            icon="document"
            iconColor={colors.accent}
            showsChevron
            onPress={() => router.push('/(tabs)/profile/privacy-policy')}
            testID="profile-privacy-policy"
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
