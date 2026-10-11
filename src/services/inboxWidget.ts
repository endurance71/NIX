import { uploadFeatures } from '../config/uploadFeatures';
import { getCurrentLocale } from '../lib/i18n';
import InboxWidget from '../widgets/InboxWidget';

let lastSnapshotKey: string | null = null;

/**
 * Mirrors the unread NiX count to the Home Screen / Lock Screen widget. Same switch as the Live
 * Activity (both live in the widget extension); a binary without the widget ignores it.
 */
export function syncInboxWidget(count: number) {
  if (!uploadFeatures.liveActivities || process.env.NODE_ENV === 'test') return;
  const locale = getCurrentLocale() === 'pl' ? 'pl' : 'en';
  const safeCount = Math.max(0, Math.floor(count));
  const key = `${safeCount}:${locale}`;
  if (key === lastSnapshotKey) return;
  try {
    InboxWidget.updateSnapshot({ count: safeCount, locale });
    lastSnapshotKey = key;
  } catch (error) {
    console.warn('Inbox widget sync failed', error);
  }
}
