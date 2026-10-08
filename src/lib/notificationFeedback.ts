import { appNotificationQueue, type NotificationToken } from './notificationQueue';
import { notify as hapticNotify } from './haptics';

/** Reveal completion may fire more than once after accessibility changes. */
export function presentAppNotification(token: NotificationToken, announce?: (message: string) => void): boolean {
  if (!appNotificationQueue.markPresented(token)) return false;
  const item = appNotificationQueue.getSnapshot().notification;
  if (!item) return false;
  if (item.kind !== 'info') hapticNotify(item.kind);
  announce?.([item.title, item.message].filter(Boolean).join('. '));
  return true;
}
