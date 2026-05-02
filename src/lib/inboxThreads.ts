import type { InboxSnap, SentSnap } from '../services/snapService';

export type InboxThreadItem =
  | {
      id: string;
      direction: 'received';
      timestamp: number;
      snap: InboxSnap;
    }
  | {
      id: string;
      direction: 'sent';
      timestamp: number;
      snap: SentSnap;
    };

function peerUserId(item: InboxThreadItem): string {
  return item.direction === 'received' ? item.snap.sender_id : item.snap.receiver_id;
}

function timestampFrom(createdAt: string): number {
  const value = new Date(createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function buildInboxThreads(inboxSnaps: readonly InboxSnap[], sentSnaps: readonly SentSnap[]): InboxThreadItem[] {
  const byPeer = new Map<
    string,
    {
      latest: InboxThreadItem;
      latestUnreadReceived: InboxThreadItem | null;
    }
  >();

  const items: InboxThreadItem[] = [
    ...inboxSnaps.map((snap) => ({
      id: `received-${snap.id}`,
      direction: 'received' as const,
      timestamp: timestampFrom(snap.created_at),
      snap,
    })),
    ...sentSnaps.map((snap) => ({
      id: `sent-${snap.id}`,
      direction: 'sent' as const,
      timestamp: timestampFrom(snap.created_at),
      snap,
    })),
  ];

  for (const item of items) {
    const id = peerUserId(item);
    const prev = byPeer.get(id);
    const isUnreadReceived = item.direction === 'received' && item.snap.is_viewed !== true;

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
