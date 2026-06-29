import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from './useAuth';
import {
  listAcceptedFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { getCurrentUserProfile } from '../services/profileService';
import { useAppTheme } from './useAppTheme';
import { useProfileQrPayload } from './useProfileQrPayload';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { notifyError } from '../lib/appNotify';
import { useTranslation } from 'react-i18next';
import { listCapturePoliciesForFriends, type CapturePolicy } from '../services/capturePolicyService';
import { resolveCapturePolicyForFriend } from '../lib/capturePolicy';
import { runWithFinally } from '../lib/runWithFinally';
import {
  acceptProfileFriendRequest,
  cancelProfileOutgoingRequest,
  handleProfileAvatarPickError,
  pickProfileAvatarPhoto,
  rejectProfileFriendRequest,
  removeProfileFriend,
  sendProfileInvite,
  toggleProfileFriendCapture,
} from '../lib/profileScreenActions';

export function useProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();
  const { user, signOut } = useAuth();
  const qrPayload = useProfileQrPayload();
  const [searchUsername, setSearchUsername] = useState('');
  const [inviteInputResetKey, setInviteInputResetKey] = useState(0);
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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const profileUsername = profileRow?.username ?? null;
  const avatarPaths = profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : [];
  const outgoingAvatarPaths = Array.from(
    new Set(
      outgoingRequests.flatMap((request) =>
        request.recipient.avatar_storage_path ? [request.recipient.avatar_storage_path] : []
      )
    )
  );
  const incomingAvatarPaths = Array.from(
    new Set(
      requests.flatMap((request) =>
        request.requester.avatar_storage_path ? [request.requester.avatar_storage_path] : []
      )
    )
  );
  const friendAvatarPaths = Array.from(
    new Set(friends.flatMap((friend) => (friend.avatar_storage_path ? [friend.avatar_storage_path] : [])))
  );
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarSignedUrl = profileRow?.avatar_storage_path ? avatarUrls[profileRow.avatar_storage_path] ?? null : null;
  const { data: outgoingAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(outgoingAvatarPaths),
    queryFn: () => createSignedAvatarUrls(outgoingAvatarPaths),
    enabled: outgoingAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const { data: incomingAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(incomingAvatarPaths),
    queryFn: () => createSignedAvatarUrls(incomingAvatarPaths),
    enabled: incomingAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const { data: friendAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(friendAvatarPaths),
    queryFn: () => createSignedAvatarUrls(friendAvatarPaths),
    enabled: friendAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const friendIds = friends.map((friend) => friend.id);
  const friendCapturePoliciesQueryKey = queryKeys.friendCapturePolicies(friendIds);
  const { data: friendCapturePolicies = {} } = useQuery({
    queryKey: friendCapturePoliciesQueryKey,
    queryFn: () => listCapturePoliciesForFriends(friendIds),
    enabled: friendIds.length > 0,
    staleTime: 60_000,
  });

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const invalidateSocialQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile }),
    ]);
  };

  const handleListRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.outgoingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.acceptedFriends, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.currentUserProfile, type: 'active' }),
      ]);
    } catch (err) {
      console.error('Profile social refresh failed', err);
      notifyError(t('notify.refreshFailedTitle'), { message: t('notify.refreshFailedBody') });
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
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
    }, [queryClient])
  );

  const handlePickAvatarPhoto = async () => {
    setAvatarBusy(true);
    await runWithFinally(
      () => pickProfileAvatarPhoto(invalidateSocialQueries),
      () => setAvatarBusy(false)
    ).catch(handleProfileAvatarPickError);
  };

  const handleSendInvite = async () => {
    setActionLoadingId('invite');
    await runWithFinally(
      () =>
        sendProfileInvite(searchUsername, invalidateSocialQueries, () => {
          setSearchUsername('');
          setInviteInputResetKey((prev) => prev + 1);
        }),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? 'Nie udało się wysłać zaproszenia.');
    });
  };

  const handleAccept = async (requestId: string) => {
    setActionLoadingId(requestId);
    await runWithFinally(
      () => acceptProfileFriendRequest(requestId, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? 'Nie udało się zaakceptować zaproszenia.');
    });
  };

  const handleReject = async (requestId: string) => {
    setActionLoadingId(requestId);
    await runWithFinally(
      () => rejectProfileFriendRequest(requestId, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? 'Nie udało się odrzucić zaproszenia.');
    });
  };

  const handleNativeIncomingDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const request = requests[firstIndex];
    if (!request) return;
    if (actionLoadingId === request.id) return;
    await handleReject(request.id);
  };

  const handleCancelOutgoing = async (requestId: string) => {
    setActionLoadingId(`outgoing-${requestId}`);
    await runWithFinally(
      () => cancelProfileOutgoingRequest(requestId, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? 'Nie udało się usunąć zaproszenia.');
    });
  };

  const handleNativeOutgoingDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const request = outgoingRequests[firstIndex];
    if (!request) return;
    const loadingId = `outgoing-${request.id}`;
    if (actionLoadingId === loadingId) return;
    await handleCancelOutgoing(request.id);
  };

  const handleNativeFriendDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const friend = friends[firstIndex];
    if (!friend) return;
    const loadingId = `friend-${friend.id}`;
    if (actionLoadingId === loadingId) return;

    setActionLoadingId(loadingId);
    await runWithFinally(
      () => removeProfileFriend(friend.id, friend.username, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? 'Nie udało się usunąć znajomego.');
    });
  };

  const hasAvatar = Boolean(profileRow?.avatar_storage_path || profileRow?.avatar_emoji);
  const initialLetter = (profileUsername ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();
  const resolveFriendCapturePolicy = (friendId: string): CapturePolicy =>
    resolveCapturePolicyForFriend(friendCapturePolicies, friendId);

  const handleToggleFriendCapture = async (friendId: string, nextAllowed: boolean) => {
    const nextPolicy: CapturePolicy = nextAllowed ? 'allow' : 'deny';
    const loadingId = `capture-${friendId}`;
    if (actionLoadingId === loadingId) return;

    setActionLoadingId(loadingId);
    await runWithFinally(
      () => toggleProfileFriendCapture(friendId, nextPolicy, queryClient, friendCapturePoliciesQueryKey),
      () => setActionLoadingId(null)
    ).catch(() => {});
  };

  return {
    profilePending,
    colors,
    statusBarStyle,
    t,
    user,
    profileUsername,
    qrPayload,
    profileRow,
    avatarSignedUrl,
    avatarBusy,
    refreshing,
    hasAvatar,
    initialLetter,
    searchUsername,
    setSearchUsername,
    inviteInputResetKey,
    handlePickAvatarPhoto,
    handleSendInvite,
    handleListRefresh,
    requests,
    outgoingRequests,
    friends,
    actionLoadingId,
    incomingAvatarUrls,
    outgoingAvatarUrls,
    friendAvatarUrls,
    handleAccept,
    handleReject,
    handleNativeIncomingDelete,
    handleCancelOutgoing,
    handleNativeOutgoingDelete,
    handleNativeFriendDelete,
    resolveFriendCapturePolicy,
    handleToggleFriendCapture,
    handleSignOut,
  };
}
