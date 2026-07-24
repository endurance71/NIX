import type { InboxNix, SentNix } from '../services/nixService';
import type { RecentTextMessageItem } from '../services/textMessageService';

export type InboxPeerProfile = {
  username: string;
  display_name?: string | null;
  avatar_storage_path?: string | null;
  avatar_emoji?: string | null;
};

export type TextMessageForInbox = RecentTextMessageItem & {
  peerProfile?: InboxPeerProfile | null;
};

export type InboxThreadItem =
  | {
      id: string;
      kind: 'nix';
      direction: 'received';
      timestamp: number;
      nix: InboxNix;
    }
  | {
      id: string;
      kind: 'nix';
      direction: 'sent';
      timestamp: number;
      nix: SentNix;
    }
  | {
      id: string;
      kind: 'text';
      direction: 'received' | 'sent';
      timestamp: number;
      textMessage: RecentTextMessageItem;
      peerProfile?: InboxPeerProfile | null;
    };

type PeerThreadState = {
  latest: InboxThreadItem;
  latestUnreadReceived: Extract<InboxThreadItem, { kind: 'nix'; direction: 'received' }> | null;
  bestProfile: InboxPeerProfile | null;
};

function peerUserId(item: InboxThreadItem): string {
  if (item.kind === 'text') {
    return item.textMessage.peer_id;
  }
  return item.direction === 'received' ? item.nix.sender_id : item.nix.receiver_id;
}

function timestampFrom(createdAt: string): number {
  const value = new Date(createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function profileFromItem(item: InboxThreadItem): InboxPeerProfile | null {
  if (item.kind === 'text') {
    return item.peerProfile?.username ? item.peerProfile : null;
  }
  if (item.direction === 'received') {
    const sender = item.nix.sender;
    return sender?.username
      ? {
          username: sender.username,
          display_name: sender.display_name ?? null,
          avatar_storage_path: sender.avatar_storage_path ?? null,
          avatar_emoji: sender.avatar_emoji ?? null,
        }
      : null;
  }
  const receiver = item.nix.receiver;
  return receiver?.username
    ? {
        username: receiver.username,
        display_name: receiver.display_name ?? null,
        avatar_storage_path: receiver.avatar_storage_path ?? null,
        avatar_emoji: receiver.avatar_emoji ?? null,
      }
    : null;
}

function withEnrichedProfile(item: InboxThreadItem, profile: InboxPeerProfile | null): InboxThreadItem {
  if (!profile) return item;
  if (item.kind === 'text') {
    return { ...item, peerProfile: item.peerProfile?.username ? item.peerProfile : profile };
  }
  if (item.direction === 'received') {
    if (item.nix.sender?.username) return item;
    return {
      ...item,
      nix: {
        ...item.nix,
        sender: {
          username: profile.username,
          display_name: profile.display_name ?? null,
          avatar_storage_path: profile.avatar_storage_path ?? null,
          avatar_emoji: profile.avatar_emoji ?? null,
        },
      },
    };
  }
  if (item.nix.receiver?.username) return item;
  return {
    ...item,
    nix: {
      ...item.nix,
      receiver: {
        username: profile.username,
        display_name: profile.display_name ?? null,
        avatar_storage_path: profile.avatar_storage_path ?? null,
        avatar_emoji: profile.avatar_emoji ?? null,
      },
    },
  };
}

export function buildInboxThreads(
  inboxNixes: readonly InboxNix[],
  sentNixes: readonly SentNix[],
  textMessages: readonly TextMessageForInbox[] = []
): InboxThreadItem[] {
  const byPeer = new Map<string, PeerThreadState>();

  const items: InboxThreadItem[] = [
    ...inboxNixes.map((nix) => ({
      id: `received-nix-${nix.id}`,
      kind: 'nix' as const,
      direction: 'received' as const,
      timestamp: timestampFrom(nix.created_at),
      nix,
    })),
    ...sentNixes.map((nix) => ({
      id: `sent-nix-${nix.id}`,
      kind: 'nix' as const,
      direction: 'sent' as const,
      timestamp: timestampFrom(nix.created_at),
      nix,
    })),
    ...textMessages.map((msg) => {
      const isReceived = msg.peer_id === msg.sender_id;
      return {
        id: `text-${msg.id}`,
        kind: 'text' as const,
        direction: isReceived ? ('received' as const) : ('sent' as const),
        timestamp: timestampFrom(msg.created_at),
        textMessage: msg,
        peerProfile: msg.peerProfile ?? null,
      };
    }),
  ];

  for (const item of items) {
    const id = peerUserId(item);
    const profile = profileFromItem(item);
    const prev = byPeer.get(id);
    const isUnreadReceivedNix =
      item.kind === 'nix' && item.direction === 'received' && item.nix.is_viewed !== true;

    if (!prev) {
      byPeer.set(id, {
        latest: item,
        latestUnreadReceived: isUnreadReceivedNix ? item : null,
        bestProfile: profile,
      });
      continue;
    }

    if (profile && !prev.bestProfile?.username) {
      prev.bestProfile = profile;
    }

    if (item.timestamp > prev.latest.timestamp) {
      prev.latest = item;
    }

    if (
      isUnreadReceivedNix &&
      (!prev.latestUnreadReceived || item.timestamp > prev.latestUnreadReceived.timestamp)
    ) {
      prev.latestUnreadReceived = item;
    }
  }

  return [...byPeer.values()]
    .map((entry) => withEnrichedProfile(entry.latestUnreadReceived ?? entry.latest, entry.bestProfile))
    .sort((a, b) => b.timestamp - a.timestamp);
}
