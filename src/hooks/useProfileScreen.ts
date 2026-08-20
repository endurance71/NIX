import * as StoreReview from 'expo-store-review';
import * as Linking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import {
  listAcceptedFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../services/friendService';
import {
  AVATAR_SIGNED_URL_STALE_TIME_MS,
  createSignedAvatarUrls,
} from '../services/avatarService';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../services/profileService';
import { useAppTheme } from './useAppTheme';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { notifyError, notifySuccess } from '../lib/appNotify';
import { getPendingInviteCount } from '../lib/profileFriendsPresentation';
import { userHasEmailPasswordIdentity } from '../lib/authProviders';
import { usePushNotifications } from '../context/pushNotifications';
import {
  getProductAnalyticsConsent,
  setProductAnalyticsConsent,
} from '../services/productAnalyticsService';
import { getActivationState } from '../services/activationService';

export function useProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();
  const { user, signOut } = useAuth();
  const pushNotifications = usePushNotifications();
  const { data: analyticsEnabled = false, isPending: analyticsPending } = useQuery({
    queryKey: queryKeys.productAnalyticsConsent,
    queryFn: getProductAnalyticsConsent,
    staleTime: 1000 * 60 * 5,
  });
  const { data: activationState } = useQuery({
    queryKey: queryKeys.activationState,
    queryFn: getActivationState,
    staleTime: 30_000,
  });

  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    staleTime: 1000 * 60 * 5,
  });
  const { data: requests = [] } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 1000 * 60,
  });
  const { data: outgoingRequests = [] } = useQuery({
    queryKey: queryKeys.outgoingFriendRequests,
    queryFn: listOutgoingFriendRequests,
    staleTime: 1000 * 60,
  });
  const { data: friends = [] } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 50 }),
    staleTime: 1000 * 60 * 2,
  });

  const profileUsername = profileRow?.username ?? null;
  const avatarPaths = profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : [];
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarSignedUrl = profileRow?.avatar_storage_path
    ? avatarUrls[profileRow.avatar_storage_path] ?? null
    : null;

  const handleListRefresh = async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.currentUserProfile(user?.id ?? null), type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.outgoingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.acceptedFriends, type: 'active' }),
      ]);
    } catch (err) {
      console.error('Profile refresh failed', err);
      notifyError(t('notify.refreshFailedTitle'), { message: t('notify.refreshFailedBody') });
    }
  };

  useFocusEffect(() => {
    void queryClient.refetchQueries({
      type: 'active',
      predicate: (query) => {
        const key = query.queryKey[0];
        if (
          key !== queryKeys.currentUserProfiles[0] &&
          key !== queryKeys.incomingFriendRequests[0] &&
          key !== queryKeys.outgoingFriendRequests[0] &&
          key !== queryKeys.acceptedFriends[0]
        ) {
          return false;
        }
        return query.isStale();
      },
    });
  });

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    router.replace('/(auth)/login');
  };

  const handleTogglePrivacy = async (isPrivate: boolean) => {
    try {
      await updateCurrentUserProfile({ is_private: isPrivate });
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile(user?.id ?? null) });
    } catch {
      notifyError(t('profile.privacyUpdateFailed', 'Nie udało się zmienić prywatności'));
    }
  };

  const handleRateApp = async () => {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      } else {
        notifyError(t('profile.rateAppUnavailable', 'Ocenianie niedostępne'));
      }
    } catch {
      notifyError(t('profile.rateAppUnavailable', 'Ocenianie niedostępne'));
    }
  };

  const handleSupport = () => {
    Linking.openURL('mailto:kontakt@damianmotylinski.pl').catch(() => {
      notifyError(t('profile.supportUnavailable', 'Nie można otworzyć klienta poczty'));
    });
  };

  const initialLetter = (profileUsername ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();
  const canChangePassword = userHasEmailPasswordIdentity(user);
  const pushSupportingText = t(`push.state.${pushNotifications.state}`);

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) await pushNotifications.enable();
    else await pushNotifications.disable();
  };

  const handleAnalyticsToggle = async (enabled: boolean) => {
    try {
      await setProductAnalyticsConsent(enabled);
      queryClient.setQueryData(queryKeys.productAnalyticsConsent, enabled);
      notifySuccess(enabled ? t('profile.analyticsEnabled') : t('profile.analyticsDisabled'));
    } catch {
      notifyError(t('profile.analyticsUpdateFailed'));
    }
  };

  return {
    profilePending,
    colors,
    statusBarStyle,
    t,
    user,
    profileUsername,
    profileRow,
    avatarSignedUrl,
    initialLetter,
    friendCount: friends.length,
    pendingInviteCount: getPendingInviteCount(requests.length, outgoingRequests.length),
    handleListRefresh,
    handleSignOut,
    canChangePassword,
    pushNotificationsEnabled: pushNotifications.state === 'enabled',
    pushNotificationsBusy: pushNotifications.busy || pushNotifications.state === 'loading',
    pushSupportingText,
    handlePushToggle,
    handleTogglePrivacy,
    handleRateApp,
    handleSupport,
    analyticsEnabled,
    analyticsPending,
    handleAnalyticsToggle,
    activationState,
  };
}
