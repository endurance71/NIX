import { toDomainError } from '../services/errors';
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

export function notifyDomainError(err: unknown, fallbackMessage: string): string {
  const domain = toDomainError(err, fallbackMessage);
  const translated = i18n.t(domain.messageKey, {
    defaultValue: domain.message,
    ...domain.messageParams,
  });
  return notifyError(translated);
}
