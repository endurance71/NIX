export function getPendingInviteCount(incomingCount: number, outgoingCount: number): number {
  return Math.max(0, incomingCount) + Math.max(0, outgoingCount);
}

/** Per-row busy keys for the Friends screen: parallel actions never overwrite each other's state. */
export const friendActionKey = {
  invite: 'invite',
  incoming: (requestId: string) => `incoming-${requestId}`,
  outgoing: (requestId: string) => `outgoing-${requestId}`,
  friend: (friendId: string) => `friend-${friendId}`,
} as const;

export function isIncomingRequestBusy(busyKeys: ReadonlySet<string>, requestId: string): boolean {
  return busyKeys.has(friendActionKey.incoming(requestId));
}

export function isOutgoingRequestBusy(busyKeys: ReadonlySet<string>, requestId: string): boolean {
  return busyKeys.has(friendActionKey.outgoing(requestId));
}

export function isFriendRowBusy(busyKeys: ReadonlySet<string>, friendId: string): boolean {
  return busyKeys.has(friendActionKey.friend(friendId));
}

/** Adds a busy key; `null` when that action is already running (double tap). */
export function beginBusyKey(busyKeys: ReadonlySet<string>, key: string): Set<string> | null {
  if (busyKeys.has(key)) return null;
  return new Set(busyKeys).add(key);
}

export function endBusyKey(busyKeys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(busyKeys);
  next.delete(key);
  return next;
}
