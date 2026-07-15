import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import { Stack, router } from 'expo-router';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import {
  NativeSettingsCenteredFooter,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../ui/native-settings';
import { SettingsListScreen } from '../ui/settings-list-screen';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();
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
      <SettingsListScreen loading={vm.profilePending} onRefresh={vm.handleListRefresh}>
        <NativeSettingsSection>
          <NativeSettingsRow
            title={`@${vm.profileUsername ?? vm.t('profile.missingUsername')}`}
            avatar={{
              url: vm.avatarSignedUrl,
              storagePath: vm.profileRow?.avatar_storage_path ?? null,
              emoji: vm.profileRow?.avatar_emoji ?? null,
              fallbackInitial: vm.initialLetter,
              size: 56,
            }}
            testID="profile-identity"
          />
          <NativeSettingsRow
            title={vm.avatarBusy ? vm.t('profile.changeAvatarLoading') : vm.t('profile.changeAvatar')}
            icon="photoLibrary"
            disabled={vm.avatarBusy}
            onPress={() => void vm.handlePickAvatarPhoto()}
            testID="profile-change-avatar"
          />
          {vm.hasAvatar ? (
            <NativeSettingsRow
              title={vm.t('profile.removeAvatar')}
              icon="trash"
              role="destructive"
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

        <NativeSettingsSection title={vm.t('profile.social')}>
          <NativeSettingsRow
            title={vm.t('profile.friendsTitle')}
            supportingText={socialSummary}
            icon="profile"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/friends')}
            testID="profile-friends"
          />
          <NativeSettingsRow
            title={vm.t('profile.myQrCode')}
            icon="qrcode"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/my-code')}
            testID="profile-my-code"
          />
        </NativeSettingsSection>

        {Platform.OS === 'ios' ? (
          <NativeSettingsSection title={vm.t('push.sectionTitle')}>
            <NativeSettingsRow
              title={vm.t('push.rowTitle')}
              supportingText={vm.pushSupportingText}
              icon="notification"
              switchValue={vm.pushNotificationsEnabled}
              onSwitchValueChange={(enabled) => void vm.handlePushToggle(enabled)}
              disabled={vm.pushNotificationsBusy}
              testID="profile-push-notifications"
            />
          </NativeSettingsSection>
        ) : null}

        <NativeSettingsSection title={vm.t('profile.account')}>
          <NativeSettingsRow
            title={vm.t('profile.safetyCenter')}
            supportingText={vm.t('profile.safetyCenterSummary')}
            icon="shield"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/safety')}
            testID="profile-safety"
          />
          {vm.canChangePassword ? (
            <NativeSettingsRow
              title={vm.t('profile.changePassword')}
              icon="lock"
              showsChevron
              onPress={() => router.push('/(tabs)/profile/change-password')}
              testID="profile-change-password"
            />
          ) : null}
          <NativeSettingsRow
            title={vm.t('profile.privacyPolicy')}
            icon="shield"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/privacy-policy')}
            testID="profile-privacy-policy"
          />
          <NativeSettingsRow
            title={vm.t('profile.terms')}
            icon="document"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/terms')}
            testID="profile-terms"
          />
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
        </NativeSettingsSection>
        <NativeSettingsCenteredFooter lines={accountFooterLines} />
      </SettingsListScreen>
      <Stack.Screen.Title large>{vm.t('profile.title')}</Stack.Screen.Title>
    </>
  );
}
