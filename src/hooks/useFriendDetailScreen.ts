import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { notifyDomainError, notifyError, notifyOffline, notifySuccess } from '../lib/appNotify';
import { getCurrentLocale } from '../lib/i18n';
import type { ConversationMuteDuration } from '../lib/inboxRowMenu';
import { beginBusyKey, endBusyKey } from '../lib/profileFriendsPresentation';
import { removeProfileFriend, toggleProfileFriendCapture } from '../lib/profileScreenActions';
import { queryKeys } from '../lib/queryKeys';
import { runWithFinally } from '../lib/runWithFinally';
import { listCapturePoliciesForFriends } from '../services/capturePolicyService';
import { ACCEPTED_FRIENDS_LIMIT, listAcceptedFriends } from '../services/friendService';
import {
  getConversationMute,
  setConversationMute,
} from '../services/notificationPreferencesService';
import { blockUser, reportContent, type ReportReason } from '../services/safetyService';
import { useAppTheme } from './useAppTheme';
import { useAuth } from './useAuth';
import { useSignedAvatarUrls } from './useSignedAvatarUrls';
import { useFriendshipBadge } from './useFriendshipBadges';

type FriendAction = 'capture' | 'mute' | 'remove' | 'block' | 'report';

function formatMutedUntil(mutedUntil: string, locale: string): string {
  const date = new Date(mutedUntil);
  const sameDay = new Date().toDateString() === date.toDateString();
  return date.toLocaleString(locale, {
    ...(sameDay ? {} : { weekday: 'short' as const }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One friend: profile card, quick actions, screenshot permission, mute and safety actions. */
export function useFriendDetailScreen(friendId: string) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { user, canUseNetworkSession } = useAuth();
  const muteAvailable = iosRoadmapFeatures.communicationControls;
  const busyRef = useRef<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const friendsQuery = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });
  const friend = friendsQuery.data?.find((candidate) => candidate.id === friendId) ?? null;

  const captureQueryKey = queryKeys.friendCapturePolicies([friendId]);
  const captureQuery = useQuery({
    queryKey: captureQueryKey,
    queryFn: () => listCapturePoliciesForFriends([friendId]),
    enabled: canUseNetworkSession && Boolean(friendId),
    staleTime: 60_000,
  });
  // Unknown until loaded: the switch is not drawn instead of pretending "deny" is a choice.
  const capturePolicy = captureQuery.data?.[friendId];

  const muteQuery = useQuery({
    queryKey: queryKeys.conversationMute(friendId),
    queryFn: () => getConversationMute(friendId),
    enabled: canUseNetworkSession && muteAvailable && Boolean(friendId),
    staleTime: 30_000,
  });
  const mute = muteQuery.data ?? null;
  const friendshipBadge = useFriendshipBadge(friendId);
  const locale = getCurrentLocale();

  const avatarPath = friend?.avatar_storage_path ?? null;
  const avatarUrls = useSignedAvatarUrls([avatarPath], { enabled: canUseNetworkSession });

  const runAction = async (action: FriendAction, task: () => Promise<void>, failure: string) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    const started = beginBusyKey(busyRef.current, action);
    if (!started) return;
    busyRef.current = started;
    setBusy(started);
    await runWithFinally(task, () => {
      busyRef.current = endBusyKey(busyRef.current, action);
      setBusy(busyRef.current);
    }).catch((error: unknown) => {
      notifyDomainError(error, failure);
    });
  };

  const handleToggleCapture = (allowed: boolean) =>
    runAction(
      'capture',
      async () => {
        await toggleProfileFriendCapture(
          friendId,
          allowed ? 'allow' : 'deny',
          queryClient,
          captureQueryKey,
        ).catch(() => {
          // toggleProfileFriendCapture already rolled back and showed the error.
        });
        // The Friends list and send flows cache policies under other id sets.
        void queryClient.invalidateQueries({ queryKey: ['friendCapturePolicies'] });
      },
      t('notify.capturePreferencesFailed'),
    );

  const handleSetMute = (duration: ConversationMuteDuration | 'off') =>
    runAction(
      'mute',
      async () => {
        await setConversationMute(friendId, duration);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.conversationMute(friendId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.conversationMutes }),
        ]);
      },
      t('chat.muteFailure'),
    );

  const handleRemove = () =>
    runAction(
      'remove',
      async () => {
        await removeProfileFriend(friendId, friend?.username ?? '', async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
            queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile(user?.id ?? null) }),
          ]);
        });
        router.back();
      },
      t('profile.friendRemoveFailure'),
    );

  const handleBlock = () =>
    runAction(
      'block',
      async () => {
        await blockUser(friendId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers }),
          queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
          queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
        ]);
        notifySuccess(t('viewer.blockSuccess'));
        router.back();
      },
      t('viewer.blockFailure'),
    );

  const handleReport = (reason: ReportReason) =>
    runAction(
      'report',
      async () => {
        await reportContent({
          reportedUserId: friendId,
          reason,
          details: 'User reported a friend from the friend detail screen.',
        });
        notifySuccess(t('chat.reportPeerSuccess'));
      },
      t('chat.reportPeerFailure'),
    );

  const handleSendNix = () => {
    // The camera tab (index route of the tabs) reads `recipientId` and forwards it to the preview.
    // dismissTo pops back to the existing (tabs) route; navigate would push a second (tabs) on top
    // of this root-stack screen (expo-router 57).
    router.dismissTo({ pathname: '/(tabs)', params: { recipientId: friendId } });
  };

  const handleMessage = () => {
    router.push({ pathname: '/chat/[peerId]', params: { peerId: friendId } });
  };

  const handleRefresh = async () => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    try {
      await Promise.all([
        friendsQuery.refetch(),
        captureQuery.refetch(),
        muteAvailable ? muteQuery.refetch() : Promise.resolve(),
        queryClient
          .refetchQueries({ queryKey: queryKeys.friendStreaks, type: 'active' })
          .catch(() => undefined),
      ]);
    } catch (error) {
      console.error('Friend detail refresh failed', error);
      notifyError(t('notify.refreshFailedTitle'), { message: t('notify.refreshFailedBody') });
    }
  };

  return {
    t,
    colors,
    friend,
    avatarUrl: avatarPath ? (avatarUrls[avatarPath] ?? null) : null,
    loading: canUseNetworkSession && friendsQuery.isPending && friendsQuery.data === undefined,
    notFound: friendsQuery.data !== undefined && !friend,
    offlineWithoutData: !canUseNetworkSession && friendsQuery.data === undefined,
    capturePolicy,
    friendshipBadge,
    muteAvailable,
    isMuted: Boolean(mute),
    mutedUntilLabel: mute?.muted_until ? formatMutedUntil(mute.muted_until, locale) : null,
    busy,
    canPerformNetworkAction: canUseNetworkSession,
    handleToggleCapture,
    handleSetMute,
    handleRemove,
    handleBlock,
    handleReport,
    handleSendNix,
    handleMessage,
    handleRefresh,
  };
}

