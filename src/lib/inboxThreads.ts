import type { InboxNix, SentNix } from '../services/nixService';

export type InboxThreadItem =
  | {
      id: string;
      direction: 'received';
      timestamp: number;
      nix: InboxNix;
    }
  | {
      id: string;
      direction: 'sent';
      timestamp: number;
      nix: SentNix;
    };

function peerUserId(item: InboxThreadItem): string {
  return item.direction === 'received' ? item.nix.sender_id : item.nix.receiver_id;
}

function timestampFrom(createdAt: string): number {
  const value = new Date(createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function buildInboxThreads(inboxNixes: readonly InboxNix[], sentNixes: readonly SentNix[]): InboxThreadItem[] {
  const byPeer = new Map<
    string,
    {
      latest: InboxThreadItem;
      latestUnreadReceived: InboxThreadItem | null;
    }
  >();

  const items: InboxThreadItem[] = [
    ...inboxNixes.map((nix) => ({
      id: `received-${nix.id}`,
      direction: 'received' as const,
      timestamp: timestampFrom(nix.created_at),
      nix,
    })),
    ...sentNixes.map((nix) => ({
      id: `sent-${nix.id}`,
      direction: 'sent' as const,
      timestamp: timestampFrom(nix.created_at),
      nix,
    })),
  ];

  for (const item of items) {
    const id = peerUserId(item);
    const prev = byPeer.get(id);
    const isUnreadReceived = item.direction === 'received' && item.nix.is_viewed !== true;

    if (!prev) {
      byPeer.set(id, {
        latest: item,
        latestUnreadReceived: isUnreadReceived ? item : null,
      });
      continue;
    }

    if (item.timestamp > prev.latest.timestamp) {
      prev.latest = item;
    }

    if (isUnreadReceived && (!prev.latestUnreadReceived || item.timestamp > prev.latestUnreadReceived.timestamp)) {
      prev.latestUnreadReceived = item;
    }
  }

  return [...byPeer.values()]
    .map((entry) => entry.latestUnreadReceived ?? entry.latest)
    .sort((a, b) => b.timestamp - a.timestamp);
}
