import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useQuery } from '@tanstack/react-query';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useInboxBadgeCount } from '../../hooks/useInboxBadgeCount';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../../services/avatarService';
import { createNativeTabAvatarIconSource } from '../../services/nativeTabAvatarIcon';
import { getCurrentUserProfile } from '../../services/profileService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../../lib/queryKeys';

export default function AppTabsLayout() {
  const { colors } = useAppTheme();
  const { count } = useInboxBadgeCount();
  const { data: profileRow = null } = useQuery({
    queryKey: queryKeys.currentUserProfile,
    queryFn: getCurrentUserProfile,
    staleTime: 1000 * 60 * 5,
  });
  const avatarPath = profileRow?.avatar_storage_path ?? null;
  const avatarPaths = avatarPath ? [avatarPath] : [];
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarUrl = avatarPath ? avatarUrls[avatarPath] ?? null : null;
  const { data: tabAvatarIconSource = null } = useQuery({
    queryKey: ['nativeTabAvatarIcon', avatarPath, avatarUrl] as const,
    queryFn: () => createNativeTabAvatarIconSource(avatarUrl ?? '', avatarPath ?? 'current'),
    enabled: Boolean(avatarPath && avatarUrl),
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="camera.fill" md="photo_camera" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon sf="tray.fill" md="inbox" />
        <NativeTabs.Trigger.Label hidden />
        {count > 0 ? <NativeTabs.Trigger.Badge>{String(count)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        {tabAvatarIconSource ? (
          <NativeTabs.Trigger.Icon src={tabAvatarIconSource} renderingMode="original" />
        ) : (
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="account_circle" />
        )}
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
