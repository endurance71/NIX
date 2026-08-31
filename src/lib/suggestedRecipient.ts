/**
 * Preselect a send-to recipient only when it is on the current accepted-friends
 * list. Arbitrary route params must never be treated as authorized recipients.
 */
export function resolveSuggestedRecipientId(params: {
  recipientId: string | undefined | null;
  acceptedFriendIds: readonly string[];
}): string | null {
  const recipientId = params.recipientId?.trim();
  if (!recipientId) return null;
  return params.acceptedFriendIds.includes(recipientId) ? recipientId : null;
}

export function applySuggestedRecipientOnce(params: {
  alreadyApplied: boolean;
  recipientId: string | undefined | null;
  acceptedFriendIds: readonly string[];
}): { applied: boolean; selectedId: string | null } {
  if (params.alreadyApplied) {
    return { applied: true, selectedId: null };
  }
  return {
    applied: true,
    selectedId: resolveSuggestedRecipientId({
      recipientId: params.recipientId,
      acceptedFriendIds: params.acceptedFriendIds,
    }),
  };
}
