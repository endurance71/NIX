export const PUSH_NOTIFICATION_TYPES = [
  'new_nix',
  'friend_request',
  'friend_accepted',
] as const;

export type PushNotificationType = (typeof PUSH_NOTIFICATION_TYPES)[number];

export type PushNotificationData = {
  version: 1;
  type: PushNotificationType;
  entityId: string;
  actorId: string;
};

const TYPE_SET = new Set<string>(PUSH_NOTIFICATION_TYPES);

export function parsePushNotificationData(
  value: Record<string, unknown> | null | undefined
): PushNotificationData | null {
  if (!value || value.version !== 1 || typeof value.type !== 'string') return null;
  if (!TYPE_SET.has(value.type)) return null;
  if (typeof value.entityId !== 'string' || value.entityId.length === 0) return null;
  if (typeof value.actorId !== 'string' || value.actorId.length === 0) return null;

  return {
    version: 1,
    type: value.type as PushNotificationType,
    entityId: value.entityId,
    actorId: value.actorId,
  };
}

export function routeForPushNotification(
  data: PushNotificationData
): '/(tabs)/inbox' | '/(tabs)/profile/friends' {
  return data.type === 'friend_accepted' ? '/(tabs)/profile/friends' : '/(tabs)/inbox';
}
