/**
 * Jedyny punkt wywołań Pretty Toast poza root {@link ToastProvider}.
 * Krótkie komunikaty: tytuł + opcjonalny drugi wiersz (`message`).
 */
import { toast } from 'react-native-pretty-toast';
import type { ShowOptions, ToastConfig } from 'react-native-pretty-toast';
import { toDomainError } from '../services/errors';
import i18n from './i18n';

export const NOTIFY_ERROR_DURATION_MS = 5000;
const IOS_ERROR_TOAST_TEXT_TOP_PADDING = '\n';
const IOS_ERROR_TOAST_ISLAND_SPACER = ' ';

type ExtraToastFields = Omit<ToastConfig, 'title'>;

export function notifySuccess(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  return toast.success(title, extra, options);
}

export function notifyError(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  if (process.env.EXPO_OS === 'ios') {
    const paddedTitle = !title.startsWith('\n')
      ? `${IOS_ERROR_TOAST_TEXT_TOP_PADDING}${title}`
      : title;
    const message = extra?.message ?? IOS_ERROR_TOAST_ISLAND_SPACER;
    return toast.error(paddedTitle, { duration: NOTIFY_ERROR_DURATION_MS, ...extra, message }, options);
  }

  return toast.error(title, { duration: NOTIFY_ERROR_DURATION_MS, ...extra }, options);
}

export function notifyInfo(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  return toast.info(title, extra, options);
}

export function notifyWarning(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  return toast.warning(title, extra, options);
}

export function notifyShow(config: ToastConfig, options?: ShowOptions): string {
  return toast.show(config, options);
}

export function notifyDomainError(err: unknown, fallbackMessage: string, options?: ShowOptions): string {
  const domainError = toDomainError(err, fallbackMessage);
  const translatedByCode = i18n.t(domainError.messageKey, {
    ...(domainError.messageParams ?? {}),
    defaultValue: domainError.message,
  });
  return notifyError(translatedByCode, undefined, options);
}
