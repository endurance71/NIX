import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { notifyDomainError, notifyInfo, notifyOffline } from '../lib/appNotify';
import {
  MAX_CONVERSATION_PINS,
  canAddConversationPin,
  type ConversationPin,
} from '../lib/conversationPins';
import type { ConversationMuteDuration } from '../lib/inboxRowMenu';
import { queryKeys } from '../lib/queryKeys';
import {
  listActiveConversationMutes,
  listConversationPins,
  setConversationPinned,
} from '../services/conversationPreferencesService';
import { setConversationMute } from '../services/notificationPreferencesService';

const EMPTY_PINS: ConversationPin[] = [];
const EMPTY_PEER_IDS: string[] = [];

/**
 * Private per-conversation preferences shown in the inbox: pins (server-synced with a device
 * fallback) and active mutes (bell.slash). Mutes follow the communication-controls rollout flag,
 * like the mute item in the chat menu.
 */
export function useInboxPreferences({
  currentUserId,
  canUseNetworkSession,
  t,
}: {
  currentUserId: string;
  canUseNetworkSession: boolean;
  t: TFunction;
}) {
  const queryClient = useQueryClient();
  const muteAvailable = iosRoadmapFeatures.communicationControls;
  const pinsQueryKey = queryKeys.conversationPins(currentUserId || null);

  const pinsQuery = useQuery({
    queryKey: pinsQueryKey,
    queryFn: () => listConversationPins(currentUserId),
    enabled: Boolean(currentUserId),
    // The service falls back to the device copy offline, so this may run without a session.
    networkMode: 'always',
    staleTime: 5 * 60_000,
  });
  const mutesQuery = useQuery({
    queryKey: queryKeys.conversationMutes,
    queryFn: listActiveConversationMutes,
    enabled: canUseNetworkSession && muteAvailable,
    staleTime: 60_000,
  });

  const pins = pinsQuery.data ?? EMPTY_PINS;
  const mutedPeerIds = mutesQuery.data ?? EMPTY_PEER_IDS;
  const pinnedPeerIdSet = useMemo(() => new Set(pins.map((pin) => pin.peerId)), [pins]);
  const mutedPeerIdSet = useMemo(() => new Set(mutedPeerIds), [mutedPeerIds]);

  const setPinned = async (peerId: string, pinned: boolean) => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    const previous = queryClient.getQueryData<ConversationPin[]>(pinsQueryKey) ?? pins;
    if (pinned && !canAddConversationPin(previous, peerId)) {
      notifyInfo(t('inbox.pinLimit', { count: MAX_CONVERSATION_PINS }));
      return;
    }
    try {
      const next = await setConversationPinned(currentUserId, peerId, pinned, previous);
      queryClient.setQueryData(pinsQueryKey, next);
    } catch (error) {
      queryClient.setQueryData(pinsQueryKey, previous);
      notifyDomainError(error, t('inbox.pinFailure'));
    }
  };

  /** Best-effort unpin when the conversation goes away (delete / block). */
  const forgetPin = async (peerId: string) => {
    if (!pinnedPeerIdSet.has(peerId)) return;
    try {
      const next = await setConversationPinned(currentUserId, peerId, false, pins);
      queryClient.setQueryData(pinsQueryKey, next);
    } catch (error) {
      console.warn('Could not unpin a removed conversation', error);
    }
  };

  const setMute = async (peerId: string, duration: ConversationMuteDuration | 'off') => {
    if (!canUseNetworkSession) {
      notifyOffline();
      return;
    }
    try {
      await setConversationMute(peerId, duration);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.conversationMutes }),
        queryClient.invalidateQueries({ queryKey: queryKeys.conversationMute(peerId) }),
      ]);
    } catch (error) {
      notifyDomainError(error, t('chat.muteFailure'));
    }
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: pinsQueryKey, type: 'active' }),
      muteAvailable
        ? queryClient.refetchQueries({ queryKey: queryKeys.conversationMutes, type: 'active' })
        : Promise.resolve(),
    ]);
  };

  return {
    pins,
    pinnedPeerIds: pinnedPeerIdSet as ReadonlySet<string>,
    mutedPeerIds: mutedPeerIdSet as ReadonlySet<string>,
    muteAvailable,
    setPinned,
    forgetPin,
    setMute,
    refresh,
  };
}
