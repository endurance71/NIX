import type { QueryClient } from '@tanstack/react-query';
import {
  fetchInboxBundleRpc,
  fetchInboxNixes,
  fetchNixPublicProfiles,
  fetchSentNixes,
  mapInboxNixRow,
  mapSentNixRow,
  toNixPeerProfile,
  type InboxBundleRpcPayload,
  type InboxNix,
  type NixPublicProfile,
  type SentNix,
} from '../services/nixService';
import {
  fetchRecentTextMessagesForInbox,
  mapRecentTextMessageRpcRow,
  type RecentTextMessageItem,
  type RecentTextMessageRow,
} from '../services/textMessageService';
import {
  getUnreadInboxCount,
  listConversationReadStates,
  normalizeUnreadInboxCount,
} from '../services/conversationReadService';
import { trackEvent } from './telemetry';
import { createRpcFallbackGate } from './rpcFallbackGate';
import { isNetworkError } from '../services/errors';
import { queryKeys } from './queryKeys';

export type InboxBundle = {
  inboxData: InboxNix[];
  sentData: SentNix[];
  textMessagesData: (RecentTextMessageItem & {
    peerProfile?: {
      username: string;
      display_name?: string | null;
      avatar_storage_path?: string | null;
      avatar_emoji?: string | null;
    } | null;
  })[];
  unreadCount: number;
};

type InboxBundleParts = {
  inboxRows: readonly InboxNix[];
  sentRows: readonly SentNix[];
  textRows: readonly RecentTextMessageItem[];
  readStates: ReadonlyMap<string, string>;
  unreadCount: number;
  profiles: ReadonlyMap<string, NixPublicProfile>;
};

/** Shared by the RPC and the multi-query path so both produce the same bundle shape. */
function assembleInboxBundle({
  inboxRows,
  sentRows,
  textRows,
  readStates,
  unreadCount,
  profiles,
}: InboxBundleParts): InboxBundle {
  const inboxData = inboxRows.map((nix) => ({
    ...nix,
    sender: toNixPeerProfile(profiles.get(nix.sender_id)),
  }));

  const sentData = sentRows.map((nix) => ({
    ...nix,
    receiver: toNixPeerProfile(profiles.get(nix.receiver_id)),
  }));

  const textMessagesData = textRows.map((msg) => {
    const lastReadAt = readStates.get(msg.peer_id);
    const isUnread =
      msg.sender_id === msg.peer_id &&
      new Date(msg.created_at).getTime() >
        (lastReadAt ? new Date(lastReadAt).getTime() : 0);
    return {
      ...msg,
      is_unread: isUnread,
      peerProfile: toNixPeerProfile(profiles.get(msg.peer_id)),
    };
  });

  return { inboxData, sentData, textMessagesData, unreadCount };
}

/** Maps the `get_inbox_bundle` JSON to the bundle the inbox screens already consume. */
function mapInboxBundleRpcPayload(payload: InboxBundleRpcPayload): InboxBundle {
  return assembleInboxBundle({
    inboxRows: payload.inbox.map((row) => mapInboxNixRow(row)),
    sentRows: payload.sent.map((row) => mapSentNixRow(row)),
    textRows: (payload.texts as (RecentTextMessageRow & { peer_id: string })[]).map(
      mapRecentTextMessageRpcRow
    ),
    readStates: new Map(payload.read_states.map((row) => [row.peer_id, row.last_read_at] as const)),
    unreadCount: normalizeUnreadInboxCount(payload.unread_count),
    profiles: new Map(payload.profiles.map((profile) => [profile.id, profile] as const)),
  });
}

async function fetchInboxNixesBundleMultiQuery(): Promise<InboxBundle> {
  const [inboxRows, sentRows, textRows, readStates, unreadCount] = await Promise.all([
    fetchInboxNixes({ includeProfiles: false }),
    fetchSentNixes({ includeProfiles: false }),
    fetchRecentTextMessagesForInbox(),
    listConversationReadStates(),
    getUnreadInboxCount(),
  ]);
  const profileIds = [
    ...inboxRows.map((nix) => nix.sender_id),
    ...sentRows.map((nix) => nix.receiver_id),
    ...textRows.map((msg) => msg.peer_id),
  ];
  const profiles = await fetchNixPublicProfiles(profileIds);
  return assembleInboxBundle({ inboxRows, sentRows, textRows, readStates, unreadCount, profiles });
}

const inboxBundleRpcGate = createRpcFallbackGate();

/** Test hook: forget the remembered fallback. */
export function resetInboxBundleRpcFallback() {
  inboxBundleRpcGate.reset();
}

export async function fetchInboxNixesBundle(): Promise<InboxBundle> {
  if (inboxBundleRpcGate.shouldTryRpc()) {
    let payload: InboxBundleRpcPayload | null;
    try {
      payload = await fetchInboxBundleRpc();
    } catch (error) {
      // Offline: the separate queries would fail the same way.
      if (isNetworkError(error)) throw error;
      // The RPC is all-or-nothing; the multi-query path still shows NiXes and requests when only
      // one part (e.g. text messages) fails, as the inbox did before the RPC.
      trackEvent('inbox_bundle_rpc_fallback', { reason: 'rpc_error' });
      return fetchInboxNixesBundleMultiQuery();
    }
    if (payload) return mapInboxBundleRpcPayload(payload);
    inboxBundleRpcGate.markUnavailable();
    trackEvent('inbox_bundle_rpc_fallback', { reason: 'missing_rpc' });
  }
  return fetchInboxNixesBundleMultiQuery();
}

export function inboxNixesBundleQueryOptions() {
  return {
    queryKey: queryKeys.inboxNixesBundle,
    queryFn: fetchInboxNixesBundle,
    // Realtime invaliduje przy nowych wiadomościach; krótki staleTime tylko
    // generował ciężkie refetchy przy focus / przełączaniu tabów.
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  } as const;
}

export function countUnreadInboxNixes(bundle: InboxBundle | undefined): number {
  return bundle?.unreadCount ?? 0;
}

export function markInboxNixViewedInCache(
  queryClient: QueryClient,
  nixId: string,
  viewedAt = new Date().toISOString()
) {
  queryClient.setQueryData<InboxBundle>(queryKeys.inboxNixesBundle, (current) => {
    if (!current) return current;
    return {
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      inboxData: current.inboxData.map((nix) =>
        nix.id === nixId
          ? { ...nix, is_viewed: true, status: 'viewed' as const, viewed_at: viewedAt }
          : nix
      ),
    };
  });
}

/** Unplayable media removed from unread without a successful open / replay. */
export function markInboxNixUnplayableInCache(
  queryClient: QueryClient,
  nixId: string,
  viewedAt = new Date().toISOString()
) {
  queryClient.setQueryData<InboxBundle>(queryKeys.inboxNixesBundle, (current) => {
    if (!current) return current;
    const wasUnread = current.inboxData.some((nix) => nix.id === nixId && nix.is_viewed !== true);
    return {
      ...current,
      unreadCount: wasUnread ? Math.max(0, current.unreadCount - 1) : current.unreadCount,
      inboxData: current.inboxData.map((nix) =>
        nix.id === nixId
          ? {
              ...nix,
              is_viewed: true,
              is_replayed: true,
              status: 'cleaned' as const,
              viewed_at: viewedAt,
              replay_expires_at: null,
            }
          : nix
      ),
    };
  });
}
