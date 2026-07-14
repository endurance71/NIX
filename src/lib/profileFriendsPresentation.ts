export function getPendingInviteCount(incomingCount: number, outgoingCount: number): number {
  return Math.max(0, incomingCount) + Math.max(0, outgoingCount);
}

export function isOutgoingRequestBusy(actionLoadingId: string | null, requestId: string): boolean {
  return actionLoadingId === `outgoing-${requestId}`;
}

export function isFriendRowBusy(actionLoadingId: string | null, friendId: string): boolean {
  return actionLoadingId === `capture-${friendId}` || actionLoadingId === `friend-${friendId}`;
}
