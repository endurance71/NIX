import { useState } from 'react';
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
  clearProfileAvatar,
  createSignedAvatarUrls,
} from '../services/avatarService';
import { getCurrentUserProfile } from '../services/profileService';
import { useAppTheme } from './useAppTheme';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { notifyError, notifySuccess } from '../lib/appNotify';
import { runWithFinally } from '../lib/runWithFinally';
import {
  handleProfileAvatarPickError,
  pickProfileAvatarPhoto,
} from '../lib/profileScreenActions';
import { getPendingInviteCount } from '../lib/profileFriendsPresentation';

export function useProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();
  const { user, signOut } = useAuth();
  const [avatarBusy, setAvatarBusy] = useState(false);

  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile,
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

  const invalidateProfileQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
    ]);
  };

  const handleListRefresh = async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.currentUserProfile, type: 'active' }),
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
          key !== queryKeys.currentUserProfile[0] &&
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

  const handlePickAvatarPhoto = async () => {
    setAvatarBusy(true);
    await runWithFinally(
      () => pickProfileAvatarPhoto(invalidateProfileQueries),
      () => setAvatarBusy(false)
    ).catch(handleProfileAvatarPickError);
  };

  const handleRemoveAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    await runWithFinally(
      async () => {
        await clearProfileAvatar();
        await invalidateProfileQueries();
        notifySuccess(t('profile.avatarRemoved'));
      },
      () => setAvatarBusy(false)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('profile.avatarRemoveFailure'));
    });
  };

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    router.replace('/(auth)/login');
  };

  const hasAvatar = Boolean(profileRow?.avatar_storage_path || profileRow?.avatar_emoji);
  const initialLetter = (profileUsername ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();

  return {
    profilePending,
    colors,
    statusBarStyle,
    t,
    user,
    profileUsername,
    profileRow,
    avatarSignedUrl,
    avatarBusy,
    hasAvatar,
    initialLetter,
    friendCount: friends.length,
    pendingInviteCount: getPendingInviteCount(requests.length, outgoingRequests.length),
    handlePickAvatarPhoto,
    handleRemoveAvatar,
    handleListRefresh,
    handleSignOut,
  };
}
