import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ACCEPTED_FRIENDS_LIMIT,
  listAcceptedFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
} from '../services/friendService';
import { queryKeys } from '../lib/queryKeys';
import { useAppTheme } from './useAppTheme';
import { notifyDomainError, notifyError, notifyOffline } from '../lib/appNotify';
import { runWithFinally } from '../lib/runWithFinally';
import { useAuth } from './useAuth';
import { useSignedAvatarUrls } from './useSignedAvatarUrls';
import { resolveSettingsListState } from '../lib/settingsListState';
import {
  acceptProfileFriendRequest,
  cancelProfileOutgoingRequest,
  rejectProfileFriendRequest,
  removeProfileFriend,
  sendProfileInvite,
} from '../lib/profileScreenActions';
import { beginBusyKey, endBusyKey, friendActionKey } from '../lib/profileFriendsPresentation';
import { useFriendshipOverview } from './useFriendshipBadges';

export function useFriendsScreen() {
  const { t } = useTranslation();
  const { colors, statusBarStyle } = useAppTheme();
  const queryClient = useQueryClient();
  const { user, canUseNetworkSession, isOfflineAuthenticated } = useAuth();
  const [searchUsername, setSearchUsername] = useState('');
  const [inviteInputResetKey, setInviteInputResetKey] = useState(0);
  // Per-row busy state: accepting one invite never clears the spinner of another row.
  const busyKeysRef = useRef<ReadonlySet<string>>(new Set());
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());

  const { data: requests = [], isPending: requestsPending } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60,
  });
  const { data: outgoingRequests = [], isPending: outgoingPending } = useQuery({
    queryKey: queryKeys.outgoingFriendRequests,
    queryFn: listOutgoingFriendRequests,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60,
  });
  const {
    data: friendsData,
    isPending: friendsPending,
    isError: friendsError,
    refetch: refetchFriends,
  } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });
  const friends = friendsData ?? [];
  const friendship = useFriendshipOverview();

  // PERF-17: one per-path cache (shared with the inbox and send-to) signs all three lists in one
  // batch; the map is keyed by path, so each list reads its own avatars from it.
  const avatarUrls = useSignedAvatarUrls(
    [
      ...requests.map((request) => request.requester.avatar_storage_path),
      ...outgoingRequests.map((request) => request.recipient.avatar_storage_path),
      ...friends.map((friend) => friend.avatar_storage_path),
    ],
    { enabled: canUseNetworkSession }
  );

  const invalidateSocialQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile(user?.id ?? null) }),
    ]);
  };

  const handleListRefresh = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.outgoingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.acceptedFriends, type: 'active' }),
        // Screenshot permissions are edited on the friend detail screen; refresh any cached ones.
        queryClient.invalidateQueries({ queryKey: ['friendCapturePolicies'] }),
        queryClient
          .refetchQueries({ queryKey: queryKeys.friendStreaks, type: 'active' })
          .catch(() => undefined),
      ]);
    } catch (err) {
      console.error('Friends refresh failed', err);
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

  /** Runs one row action with its own busy key; a second tap on the same row is ignored. */
  const runRowAction = async (
    key: string,
    action: () => Promise<void>,
    failureMessage: string,
  ) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    const started = beginBusyKey(busyKeysRef.current, key);
    if (!started) return;
    busyKeysRef.current = started;
    setBusyKeys(started);
    await runWithFinally(action, () => {
      busyKeysRef.current = endBusyKey(busyKeysRef.current, key);
      setBusyKeys(busyKeysRef.current);
    }).catch((err: unknown) => {
      notifyDomainError(err, failureMessage);
    });
  };

  const handleSendInvite = () =>
    runRowAction(
      friendActionKey.invite,
      () =>
        sendProfileInvite(searchUsername, invalidateSocialQueries, () => {
          setSearchUsername('');
          setInviteInputResetKey((previous) => previous + 1);
        }),
      t('profile.inviteSendFailure'),
    );

  const handleAccept = (requestId: string) =>
    runRowAction(
      friendActionKey.incoming(requestId),
      () => acceptProfileFriendRequest(requestId, invalidateSocialQueries),
      t('profile.inviteAcceptFailure'),
    );

  const handleReject = (requestId: string) =>
    runRowAction(
      friendActionKey.incoming(requestId),
      () => rejectProfileFriendRequest(requestId, invalidateSocialQueries),
      t('profile.inviteRejectFailure'),
    );

  const handleCancelOutgoing = (requestId: string) =>
    runRowAction(
      friendActionKey.outgoing(requestId),
      () => cancelProfileOutgoingRequest(requestId, invalidateSocialQueries),
      t('profile.inviteCancelFailure'),
    );

  const handleRemoveFriend = (friendId: string, username: string) =>
    runRowAction(
      friendActionKey.friend(friendId),
      () => removeProfileFriend(friendId, username, invalidateSocialQueries),
      t('profile.friendRemoveFailure'),
    );

  return {
    t,
    colors,
    statusBarStyle,
    loading: canUseNetworkSession && (requestsPending || outgoingPending || friendsPending),
    friendsListState: resolveSettingsListState({
      itemCount: friends.length,
      hasData: friendsData !== undefined,
      isError: friendsError,
      canUseNetworkSession,
    }),
    retryFriends: () => void refetchFriends(),
    searchUsername,
    setSearchUsername,
    inviteInputResetKey,
    busyKeys,
    inviteBusy: busyKeys.has(friendActionKey.invite),
    requests,
    outgoingRequests,
    friends,
    friendshipBadges: friendship.badges,
    avatarUrls,
    handleListRefresh,
    handleSendInvite,
    handleAccept,
    handleReject,
    handleCancelOutgoing,
    handleRemoveFriend,
    canPerformNetworkAction: canUseNetworkSession,
    isOfflineAuthenticated,
  };
}
