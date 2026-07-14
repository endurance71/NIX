import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  listAcceptedFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { listCapturePoliciesForFriends, type CapturePolicy } from '../services/capturePolicyService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { useAppTheme } from './useAppTheme';
import { notifyError } from '../lib/appNotify';
import { resolveCapturePolicyForFriend } from '../lib/capturePolicy';
import { runWithFinally } from '../lib/runWithFinally';
import {
  acceptProfileFriendRequest,
  cancelProfileOutgoingRequest,
  rejectProfileFriendRequest,
  removeProfileFriend,
  sendProfileInvite,
  toggleProfileFriendCapture,
} from '../lib/profileScreenActions';

export function useFriendsScreen() {
  const { t } = useTranslation();
  const { colors, statusBarStyle } = useAppTheme();
  const queryClient = useQueryClient();
  const [searchUsername, setSearchUsername] = useState('');
  const [inviteInputResetKey, setInviteInputResetKey] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { data: requests = [], isPending: requestsPending } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 1000 * 60,
  });
  const { data: outgoingRequests = [], isPending: outgoingPending } = useQuery({
    queryKey: queryKeys.outgoingFriendRequests,
    queryFn: listOutgoingFriendRequests,
    staleTime: 1000 * 60,
  });
  const { data: friends = [], isPending: friendsPending } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 50 }),
    staleTime: 1000 * 60 * 2,
  });

  const incomingAvatarPaths = Array.from(
    new Set(
      requests.flatMap((request) =>
        request.requester.avatar_storage_path ? [request.requester.avatar_storage_path] : []
      )
    )
  );
  const outgoingAvatarPaths = Array.from(
    new Set(
      outgoingRequests.flatMap((request) =>
        request.recipient.avatar_storage_path ? [request.recipient.avatar_storage_path] : []
      )
    )
  );
  const friendAvatarPaths = Array.from(
    new Set(friends.flatMap((friend) => (friend.avatar_storage_path ? [friend.avatar_storage_path] : [])))
  );
  const { data: incomingAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(incomingAvatarPaths),
    queryFn: () => createSignedAvatarUrls(incomingAvatarPaths),
    enabled: incomingAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const { data: outgoingAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(outgoingAvatarPaths),
    queryFn: () => createSignedAvatarUrls(outgoingAvatarPaths),
    enabled: outgoingAvatarPaths.length > 0,
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

  const invalidateSocialQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile }),
    ]);
  };

  const handleListRefresh = async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.outgoingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.acceptedFriends, type: 'active' }),
      ]);
    } catch (err) {
      console.error('Friends refresh failed', err);
      notifyError(t('notify.refreshFailedTitle'), { message: t('notify.refreshFailedBody') });
    }
  };

  useFocusEffect(() => {
    void queryClient.refetchQueries({
      type: 'active',
      predicate: (query) => {
        const key = query.queryKey[0];
        if (
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

  const handleSendInvite = async () => {
    if (actionLoadingId === 'invite') return;
    setActionLoadingId('invite');
    await runWithFinally(
      () =>
        sendProfileInvite(searchUsername, invalidateSocialQueries, () => {
          setSearchUsername('');
          setInviteInputResetKey((previous) => previous + 1);
        }),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('profile.inviteSendFailure'));
    });
  };

  const handleAccept = async (requestId: string) => {
    if (actionLoadingId === requestId) return;
    setActionLoadingId(requestId);
    await runWithFinally(
      () => acceptProfileFriendRequest(requestId, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('profile.inviteAcceptFailure'));
    });
  };

  const handleReject = async (requestId: string) => {
    if (actionLoadingId === requestId) return;
    setActionLoadingId(requestId);
    await runWithFinally(
      () => rejectProfileFriendRequest(requestId, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('profile.inviteRejectFailure'));
    });
  };

  const handleCancelOutgoing = async (requestId: string) => {
    const loadingId = `outgoing-${requestId}`;
    if (actionLoadingId === loadingId) return;
    setActionLoadingId(loadingId);
    await runWithFinally(
      () => cancelProfileOutgoingRequest(requestId, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('profile.inviteCancelFailure'));
    });
  };

  const handleRemoveFriend = async (friendId: string, username: string) => {
    const loadingId = `friend-${friendId}`;
    if (actionLoadingId === loadingId) return;
    setActionLoadingId(loadingId);
    await runWithFinally(
      () => removeProfileFriend(friendId, username, invalidateSocialQueries),
      () => setActionLoadingId(null)
    ).catch((err: unknown) => {
      notifyError((err as { message?: string })?.message ?? t('profile.friendRemoveFailure'));
    });
  };

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
    t,
    colors,
    statusBarStyle,
    loading: requestsPending || outgoingPending || friendsPending,
    searchUsername,
    setSearchUsername,
    inviteInputResetKey,
    actionLoadingId,
    requests,
    outgoingRequests,
    friends,
    incomingAvatarUrls,
    outgoingAvatarUrls,
    friendAvatarUrls,
    handleListRefresh,
    handleSendInvite,
    handleAccept,
    handleReject,
    handleCancelOutgoing,
    handleRemoveFriend,
    resolveFriendCapturePolicy,
    handleToggleFriendCapture,
  };
}
