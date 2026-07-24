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
};

export async function fetchInboxNixesBundle(): Promise<InboxBundle> {
  const [inboxRows, sentRows, textRows] = await Promise.all([
    fetchInboxNixes({ includeProfiles: false }),
    fetchSentNixes({ includeProfiles: false }),
    fetchRecentTextMessagesForInbox(),
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
    return {
      ...msg,
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

  return { inboxData, sentData, textMessagesData };
}

export function inboxNixesBundleQueryOptions() {
  return {
    queryKey: queryKeys.inboxNixesBundle,
    queryFn: fetchInboxNixesBundle,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  } as const;
}

export function countUnreadInboxNixes(bundle: InboxBundle | undefined): number {
  return bundle?.inboxData.filter((nix) => nix.is_viewed !== true).length ?? 0;
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
      inboxData: current.inboxData.map((nix) =>
        nix.id === nixId
          ? { ...nix, is_viewed: true, status: 'viewed' as const, viewed_at: viewedAt }
          : nix
      ),
    };
  });
}
