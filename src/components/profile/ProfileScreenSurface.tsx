import { useEffect } from 'react';
import { Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { useProfileScreen } from '../../hooks/useProfileScreen';
import { registerTabScrollToTop } from '../../lib/tabBarScrollActions';
import { NativeSettingsRow, NativeSettingsSection } from '../ui/native-settings';
import { SettingsListScreen } from '../ui/settings-list-screen';

export default function ProfileScreenSurface() {
  const vm = useProfileScreen();

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
            supportingText={vm.user?.email ?? vm.t('common.unknown')}
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
            supportingText={vm.t('profile.socialSummary', {
              friends: vm.friendCount,
              invites: vm.pendingInviteCount,
            })}
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

        <NativeSettingsSection title={vm.t('profile.account')}>
          <NativeSettingsRow
            title={vm.t('profile.changePassword')}
            icon="lock"
            showsChevron
            onPress={() => router.push('/(tabs)/profile/change-password')}
            testID="profile-change-password"
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
      </SettingsListScreen>
      <Stack.Screen.Title large>{vm.t('profile.title')}</Stack.Screen.Title>
    </>
  );
}
