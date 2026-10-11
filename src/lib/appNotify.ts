import { isNetworkError, toDomainError } from '../services/errors';
import i18n from './i18n';
import { appNotificationQueue, type AppNotificationConfig } from './notificationQueue';

type NotificationDetails = Omit<AppNotificationConfig, 'title' | 'kind'>;

export function notifySuccess(title: string, details?: NotificationDetails): string {
  return appNotificationQueue.enqueue({ ...details, title, kind: 'success' });
}

export function notifyError(title: string, details?: NotificationDetails): string {
  return appNotificationQueue.enqueue({ ...details, title, kind: 'error' });
}

export function notifyInfo(title: string, details?: NotificationDetails): string {
  return appNotificationQueue.enqueue({ ...details, title, kind: 'info' });
}

export function notifyWarning(title: string, details?: NotificationDetails): string {
  return appNotificationQueue.enqueue({ ...details, title, kind: 'warning' });
}

export function notifyShow(config: AppNotificationConfig): string {
  return appNotificationQueue.enqueue(config);
}

/**
 * Shows a failure in the context of the action that failed (`fallbackMessage`, e.g. „Nie udało się wysłać”).
 * Raw `err.message` is never shown: unknown errors get a generic retry hint and transport failures a
 * connection hint, so users don't see „Network request failed” or SQL errors.
 */
export function notifyDomainError(err: unknown, fallbackMessage: string): string {
  const title = fallbackMessage.trim() || i18n.t('domainErrors.UNKNOWN');
  if (isNetworkError(err)) {
    return notifyWarning(title, { message: i18n.t('notify.networkHint') });
  }
  const domain = toDomainError(err, title);
  if (domain.code === 'UNKNOWN') {
    return notifyError(title, { message: i18n.t('notify.tryAgainHint') });
  }
  const detail = i18n.t(domain.messageKey, { defaultValue: '', ...domain.messageParams });
  return notifyError(title, detail && detail !== title ? { message: detail } : undefined);
}

/** Offline is a state, not a failure: one neutral, deduplicated hint instead of a red error per tap. */
export function notifyOffline(scope: 'action' | 'media' = 'action'): string {
  return notifyInfo(i18n.t(scope === 'media' ? 'root.offlineMediaUnavailable' : 'root.offlineActionUnavailable'), {
    id: `offline-${scope}`,
  });
}
