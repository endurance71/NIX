import type { QueryClient } from '@tanstack/react-query';
import {
  fetchInboxNixes,
  fetchNixPublicProfiles,
  fetchSentNixes,
  type InboxNix,
  type SentNix,
} from '../services/nixService';
import {
  fetchRecentTextMessagesForInbox,
  type RecentTextMessageItem,
} from '../services/textMessageService';
import {
  getUnreadInboxCount,
  listConversationReadStates,
} from '../services/conversationReadService';
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

export async function fetchInboxNixesBundle(): Promise<InboxBundle> {
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

  const inboxData = inboxRows.map((nix) => {
    const profile = profiles.get(nix.sender_id);
    return {
      ...nix,
      sender: profile
        ? {
            username: profile.username,
            display_name: profile.display_name ?? null,
            avatar_storage_path: profile.avatar_storage_path ?? null,
            avatar_emoji: profile.avatar_emoji ?? null,
          }
        : null,
    };
  });

  const sentData = sentRows.map((nix) => {
    const profile = profiles.get(nix.receiver_id);
    return {
      ...nix,
      receiver: profile
        ? {
            username: profile.username,
            display_name: profile.display_name ?? null,
            avatar_storage_path: profile.avatar_storage_path ?? null,
            avatar_emoji: profile.avatar_emoji ?? null,
          }
        : null,
    };
  });

  const textMessagesData = textRows.map((msg) => {
    const profile = profiles.get(msg.peer_id);
    const lastReadAt = readStates.get(msg.peer_id);
    const isUnread =
      msg.sender_id === msg.peer_id &&
      new Date(msg.created_at).getTime() >
        (lastReadAt ? new Date(lastReadAt).getTime() : 0);
    return {
      ...msg,
      is_unread: isUnread,
      peerProfile: profile
        ? {
            username: profile.username,
            display_name: profile.display_name ?? null,
            avatar_storage_path: profile.avatar_storage_path ?? null,
            avatar_emoji: profile.avatar_emoji ?? null,
          }
        : null,
    };
  });

  return { inboxData, sentData, textMessagesData, unreadCount };
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
