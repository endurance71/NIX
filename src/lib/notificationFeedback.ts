import { appNotificationQueue, type NotificationFeedback, type NotificationQueue, type NotificationToken } from './notificationQueue';
import { notify as hapticNotify } from './haptics';

/**
 * Haptics fire at the cause (enqueue / kind change), in the same frame as the action that produced
 * them — not ~1 s later when the reveal animation ends. `announce` re-reads a keyed card whose content
 * changed while VoiceOver focus may already be elsewhere.
 */
export function installNotificationFeedback(announce: (message: string) => void,
  queue: NotificationQueue = appNotificationQueue): () => void {
  const handler = ({ haptic, announcement }: NotificationFeedback) => {
    if (haptic) hapticNotify(haptic);
    if (announcement) announce(announcement);
  };
  queue.setFeedbackHandler(handler);
  return () => queue.setFeedbackHandler(null);
}

/** Reveal completion may fire more than once after accessibility changes; only the first one counts. */
export function presentAppNotification(token: NotificationToken, announce?: (message: string) => void): boolean {
  if (!appNotificationQueue.markPresented(token)) return false;
  const item = appNotificationQueue.getSnapshot().notification;
  if (!item) return false;
  announce?.([item.title, item.message].filter(Boolean).join('. '));
  return true;
}
