import type { InboxNix, SentNix } from '../services/nixService';
import type { RecentTextMessageItem } from '../services/textMessageService';

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
      peerProfile?: {
        username: string;
        display_name?: string | null;
        avatar_storage_path?: string | null;
        avatar_emoji?: string | null;
      } | null;
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

export function buildInboxThreads(
  inboxNixes: readonly InboxNix[],
  sentNixes: readonly SentNix[],
  textMessages: readonly RecentTextMessageItem[] = []
): InboxThreadItem[] {
  const byPeer = new Map<
    string,
    {
      latest: InboxThreadItem;
      latestUnreadReceived: InboxThreadItem | null;
    }
  >();

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
      };
    }),
  ];

  for (const item of items) {
    const id = peerUserId(item);
    const prev = byPeer.get(id);
    const isUnreadReceivedNix =
      item.kind === 'nix' && item.direction === 'received' && item.nix.is_viewed !== true;

    if (!prev) {
      byPeer.set(id, {
        latest: item,
        latestUnreadReceived: isUnreadReceivedNix ? item : null,
      });
      continue;
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
    .map((entry) => entry.latestUnreadReceived ?? entry.latest)
    .sort((a, b) => b.timestamp - a.timestamp);
}
