import * as StoreReview from 'expo-store-review';
import * as Linking from 'expo-linking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { useSignedAvatarUrls } from './useSignedAvatarUrls';
import {
  ACCEPTED_FRIENDS_LIMIT,
  listAcceptedFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../services/friendService';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../services/profileService';
import { useAppTheme } from './useAppTheme';
import { queryKeys } from '../lib/queryKeys';
import { notifyError, notifyOffline, notifySuccess } from '../lib/appNotify';
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
  const { user, signOut, canUseNetworkSession, isOfflineAuthenticated } = useAuth();
  const pushNotifications = usePushNotifications();
  const { data: analyticsEnabled = false, isPending: analyticsPending } = useQuery({
    queryKey: queryKeys.productAnalyticsConsent,
    queryFn: getProductAnalyticsConsent,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 5,
  });
  const { data: activationState } = useQuery({
    queryKey: queryKeys.activationState,
    queryFn: getActivationState,
    enabled: canUseNetworkSession,
    staleTime: 30_000,
  });

  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 5,
  });
  const { data: requests = [] } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60,
  });
  const { data: outgoingRequests = [] } = useQuery({
    queryKey: queryKeys.outgoingFriendRequests,
    queryFn: listOutgoingFriendRequests,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60,
  });
  const { data: friends = [] } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });

  const profileUsername = profileRow?.username ?? null;
  const avatarUrls = useSignedAvatarUrls([profileRow?.avatar_storage_path], {
    enabled: canUseNetworkSession,
  });
  const avatarSignedUrl = profileRow?.avatar_storage_path
    ? avatarUrls[profileRow.avatar_storage_path] ?? null
    : null;

  const handleListRefresh = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
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
    if (!canUseNetworkSession) return;
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
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    try {
      await updateCurrentUserProfile({ is_private: isPrivate });
      await queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile(user?.id ?? null) });
    } catch {
      notifyError(t('profile.privacyUpdateFailed'));
    }
  };

  const handleRateApp = async () => {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      } else {
        notifyError(t('profile.rateAppUnavailable'));
      }
    } catch {
      notifyError(t('profile.rateAppUnavailable'));
    }
  };

  const handleSupport = () => {
    Linking.openURL('mailto:kontakt@damianmotylinski.pl').catch(() => {
      notifyError(t('profile.supportUnavailable'));
    });
  };

  const initialLetter = (profileUsername ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();
  const canChangePassword = userHasEmailPasswordIdentity(user);
  const pushSupportingText = t(`push.state.${pushNotifications.state}`);

  const handlePushToggle = async (enabled: boolean) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    if (enabled) await pushNotifications.enable();
    else await pushNotifications.disable();
  };

  const handleAnalyticsToggle = async (enabled: boolean) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    try {
      await setProductAnalyticsConsent(enabled);
      queryClient.setQueryData(queryKeys.productAnalyticsConsent, enabled);
      notifySuccess(enabled ? t('profile.analyticsEnabled') : t('profile.analyticsDisabled'));
    } catch {
      notifyError(t('profile.analyticsUpdateFailed'));
    }
  };

  return {
    profilePending: canUseNetworkSession && profilePending,
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
    incomingInviteCount: requests.length,
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
    canPerformNetworkAction: canUseNetworkSession,
    isOfflineAuthenticated,
  };
}
