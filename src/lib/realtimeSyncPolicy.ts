import { queryKeys } from './queryKeys';

export type SyncArea = 'inbox' | 'friends' | 'textChat';

type RealtimeChannelTeardown = {
  teardown: () => void;
};

export async function finalizeRealtimeChannelUnsubscribe(
  channel: RealtimeChannelTeardown,
  unsubscribeResult: Promise<string>
) {
  if ((await unsubscribeResult) === 'ok') channel.teardown();
}

export function createSyncAreaDebouncer(
  onFlush: (areas: ReadonlySet<SyncArea>) => void,
  delayMs: number
) {
  const pendingAreas = new Set<SyncArea>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const areas = new Set(pendingAreas);
    pendingAreas.clear();
    if (areas.size > 0) onFlush(areas);
  };

  return {
    schedule(area: SyncArea) {
      pendingAreas.add(area);
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingAreas.clear();
    },
  };
}

export function realtimeQueryKeysForArea(area: SyncArea) {
  if (area === 'inbox' || area === 'textChat') {
    return [queryKeys.inboxNixesBundle, queryKeys.inboxActivityBundle];
  }
  return [
    queryKeys.incomingFriendRequests,
    queryKeys.outgoingFriendRequests,
    queryKeys.acceptedFriends,
    queryKeys.currentUserProfile,
  ];
}
