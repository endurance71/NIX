/**
 * Jedyny punkt wywołań Pretty Toast poza root {@link ToastProvider}.
 * Krótkie komunikaty: tytuł + opcjonalny drugi wiersz (`message`).
 */
import { toast } from 'react-native-pretty-toast';
import type { ShowOptions, ToastConfig } from 'react-native-pretty-toast';
import { toDomainError } from '../services/errors';

export const NOTIFY_ERROR_DURATION_MS = 5000;

type ExtraToastFields = Omit<ToastConfig, 'title'>;

export function notifySuccess(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  return toast.success(title, extra, options);
}

export function notifyError(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
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
  const { message } = toDomainError(err, fallbackMessage);
  return notifyError(message, undefined, options);
}
