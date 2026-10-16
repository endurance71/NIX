import { NativeTabs } from 'expo-router/native-tabs';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useInboxBadgeCount } from '../../hooks/useInboxBadgeCount';
import { AVATAR_SIGNED_URL_STALE_TIME_MS } from '../../services/avatarService';
import { createNativeTabAvatarIconSource } from '../../services/nativeTabAvatarIcon';
import { getCurrentUserProfile } from '../../services/profileService';
import { queryKeys } from '../../lib/queryKeys';
import { resolveAppIconName } from '../../theme/app-icons';
import { useAuth } from '../../hooks/useAuth';
import { useSignedAvatarUrls } from '../../hooks/useSignedAvatarUrls';
import { LockedCaptureIntake } from './LockedCaptureIntake';
import { QuickActionsSync } from './QuickActionsSync';
import { SharedIntakeSync } from './SharedIntakeSync';

export default function AppTabsLayout() {
  const { colors, isDark } = useAppTheme();
  const { count } = useInboxBadgeCount();
  const { t } = useTranslation();
  const { user, canUseNetworkSession } = useAuth();
  const { data: profileRow = null } = useQuery({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 5,
  });
  const avatarPath = profileRow?.avatar_storage_path ?? null;
  const avatarUrls = useSignedAvatarUrls([avatarPath], { enabled: canUseNetworkSession });
  const avatarUrl = avatarPath ? avatarUrls[avatarPath] ?? null : null;
  const { data: tabAvatarIconSource = null } = useQuery({
    queryKey: ['nativeTabAvatarIcon', avatarPath, avatarUrl] as const,
    queryFn: () => createNativeTabAvatarIconSource(avatarUrl ?? '', avatarPath ?? 'current'),
    enabled: canUseNetworkSession && Boolean(avatarPath && avatarUrl),
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  return (
    <>
      {/* Quick actions route through expo-router, so they live in this sub-layout. */}
      <QuickActionsSync />
      <LockedCaptureIntake />
      <SharedIntakeSync />
      <NativeTabs
        tintColor={colors.accentText}
        backgroundColor={colors.background}
        blurEffect={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        disableTransparentOnScrollEdge
        iconColor={{ default: colors.label, selected: colors.accentText }}>
        <NativeTabs.Trigger
          name="index"
          accessibilityLabel={t('tabs.camera')}
          contentStyle={{ backgroundColor: '#000000' }}>
          <NativeTabs.Trigger.Icon sf={resolveAppIconName('camera')} />
          <NativeTabs.Trigger.Label hidden />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="inbox"
          accessibilityLabel={t('tabs.inbox')}
          contentStyle={{ backgroundColor: colors.systemBackground }}>
          <NativeTabs.Trigger.Icon sf={resolveAppIconName('inbox')} />
          <NativeTabs.Trigger.Label hidden />
          {count > 0 ? (
            <NativeTabs.Trigger.Badge>{count > 99 ? '99+' : String(count)}</NativeTabs.Trigger.Badge>
          ) : null}
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="profile"
          accessibilityLabel={t('tabs.profile')}
          contentStyle={{ backgroundColor: colors.background }}>
          {tabAvatarIconSource ? (
            <NativeTabs.Trigger.Icon src={tabAvatarIconSource} renderingMode="original" />
          ) : (
            <NativeTabs.Trigger.Icon sf={resolveAppIconName('profile')} />
          )}
          <NativeTabs.Trigger.Label hidden />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
