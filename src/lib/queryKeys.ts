/** Klucze zapytań React Query — spójny cache między ekranami. */
export const queryKeys = {
  acceptedFriends: ['acceptedFriends'] as const,
  capturePolicyForSender: (senderId: string | null) => ['capturePolicyForSender', senderId ?? 'none'] as const,
  currentUserProfiles: ['currentUserProfile'] as const,
  currentUserProfile: (userId: string | null) => ['currentUserProfile', userId ?? 'none'] as const,
  friendCapturePolicies: (friendIds: readonly string[]) =>
    ['friendCapturePolicies', Array.from(new Set(friendIds.filter(Boolean))).sort()] as const,
  incomingFriendRequests: ['incomingFriendRequests'] as const,
  outgoingFriendRequests: ['outgoingFriendRequests'] as const,
  inboxNixesBundle: ['inboxNixesBundle'] as const,
  inboxActivityBundle: ['inboxActivityBundle'] as const,
  textMessagesWithPeer: (peerId: string) => ['textMessagesWithPeer', peerId] as const,
  messageReactionsWithPeer: (peerId: string) => ['messageReactionsWithPeer', peerId] as const,
  /** Prefix of every NiX reaction query: invalidate on the `nix_reaction_changed` broadcast. */
  nixReactionsAll: ['nixReactions'] as const,
  /** `nixIds` must be normalized (`normalizeNixReactionIds`): sorted, deduplicated. */
  nixReactions: (nixIds: readonly string[]) => ['nixReactions', nixIds] as const,
  currentAgeAttestation: (userId: string | null, policyVersion: string) =>
    ['currentAgeAttestation', userId ?? 'none', policyVersion] as const,
  blockedUsers: ['blockedUsers'] as const,
  contentReports: ['contentReports'] as const,
  productAnalyticsConsent: ['productAnalyticsConsent'] as const,
  activationState: ['activationState'] as const,
  notificationPreferences: ['notificationPreferences'] as const,
  conversationMute: (peerId: string) => ['conversationMute', peerId] as const,
  /** Active mutes of every conversation (inbox bell.slash glyphs). */
  conversationMutes: ['conversationMutes'] as const,
  /** Private inbox pins; server-synced with a device-local fallback. */
  conversationPins: (userId: string | null) => ['conversationPins', userId ?? 'none'] as const,
  /** Streaks and best-friend counts (`get_friend_streaks`); empty when the RPC is not deployed. */
  friendStreaks: ['friendStreaks'] as const,
  appInstallations: ['appInstallations'] as const,
  dataExportJobs: ['dataExportJobs'] as const,
  /**
   * One signed avatar URL per storage path, shared by every screen (PERF-17). Never persisted to
   * disk: `offlineCachePolicy` does not describe this key.
   */
  avatarUrl: (storagePath: string) => ['avatarUrl', storagePath] as const,
};
