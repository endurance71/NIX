/** Klucze zapytań React Query — spójny cache między ekranami. */
export const queryKeys = {
  acceptedFriends: ['acceptedFriends'] as const,
  capturePolicyForSender: (senderId: string | null) => ['capturePolicyForSender', senderId ?? 'none'] as const,
  currentUserProfile: ['currentUserProfile'] as const,
  friendCapturePolicies: (friendIds: readonly string[]) =>
    ['friendCapturePolicies', Array.from(new Set(friendIds.filter(Boolean))).sort()] as const,
  incomingFriendRequests: ['incomingFriendRequests'] as const,
  outgoingFriendRequests: ['outgoingFriendRequests'] as const,
  inboxNixesBundle: ['inboxNixesBundle'] as const,
};

const avatarSignedUrlsPrefix = 'avatarSignedUrls' as const;

/** Stabilny klucz cache dla batch podpisanych URL awatarów (posortowane ścieżki). */
export function avatarSignedUrlsQueryKey(paths: readonly string[]): readonly [typeof avatarSignedUrlsPrefix, string[]] {
  const uniqueSorted = Array.from(new Set(paths.filter(Boolean))).sort();
  return [avatarSignedUrlsPrefix, uniqueSorted];
}
