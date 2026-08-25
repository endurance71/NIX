export type OfflineCacheCategory = 'profile' | 'social' | 'inbox' | 'chat' | 'settings';

export type OfflineCacheDescriptor = {
  category: OfflineCacheCategory;
  scopeId: string | null;
};

const PROFILE_KEYS = new Set(['currentUserProfile']);
const SOCIAL_KEYS = new Set([
  'acceptedFriends',
  'incomingFriendRequests',
  'outgoingFriendRequests',
  'friendCapturePolicies',
]);
const SETTINGS_KEYS = new Set([
  'activationState',
  'notificationPreferences',
  'productAnalyticsConsent',
  'blockedUsers',
  'contentReports',
  'appInstallations',
  'dataExportJobs',
]);
const CHAT_KEYS = new Set([
  'textMessagesWithPeer',
  'peerProfile',
  'messageReactionsWithPeer',
  'chatNixesWithPeer',
  'conversationMute',
]);

export function describeOfflineCacheQuery(
  queryKey: readonly unknown[]
): OfflineCacheDescriptor | null {
  const root = typeof queryKey[0] === 'string' ? queryKey[0] : null;
  if (!root) return null;
  if (PROFILE_KEYS.has(root)) return { category: 'profile', scopeId: null };
  if (SOCIAL_KEYS.has(root)) return { category: 'social', scopeId: null };
  if (SETTINGS_KEYS.has(root)) return { category: 'settings', scopeId: null };
  if (root === 'inboxNixesBundle') return { category: 'inbox', scopeId: null };
  if (CHAT_KEYS.has(root)) {
    const peerId = typeof queryKey[1] === 'string' && queryKey[1] ? queryKey[1] : null;
    return peerId ? { category: 'chat', scopeId: peerId } : null;
  }
  return null;
}

function isUnexpired(value: unknown, now: number): boolean {
  if (!value || typeof value !== 'object' || !('expires_at' in value)) return true;
  const expiresAt = (value as { expires_at?: unknown }).expires_at;
  if (typeof expiresAt !== 'string') return true;
  const parsed = Date.parse(expiresAt);
  return !Number.isFinite(parsed) || parsed > now;
}

function withoutEmbeddedMedia<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutEmbeddedMedia) as T;
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (key === 'thumbnail_b64' || key === 'signed_url' || key === 'signedUrl') continue;
    result[key] = withoutEmbeddedMedia(nested);
  }
  return result as T;
}

function sanitizeMessages(value: unknown, now: number): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message) => isUnexpired(message, now))
    .sort((left, right) => {
      const leftAt = Date.parse(String((left as { created_at?: unknown })?.created_at ?? ''));
      const rightAt = Date.parse(String((right as { created_at?: unknown })?.created_at ?? ''));
      return leftAt - rightAt;
    })
    .slice(-50)
    .map(withoutEmbeddedMedia);
}

export function sanitizeOfflineQueryData(
  queryKey: readonly unknown[],
  data: unknown,
  now = Date.now()
): unknown {
  const root = queryKey[0];
  if (root === 'textMessagesWithPeer') return sanitizeMessages(data, now);
  if (root === 'inboxNixesBundle' && data && typeof data === 'object') {
    const bundle = data as Record<string, unknown>;
    return withoutEmbeddedMedia({
      ...bundle,
      textMessagesData: sanitizeMessages(bundle.textMessagesData, now),
    });
  }
  return withoutEmbeddedMedia(data);
}
