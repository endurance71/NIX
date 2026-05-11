/**
 * Jedyny punkt wywołań Pretty Toast poza root {@link ToastProvider}.
 * Krótkie komunikaty: tytuł + opcjonalny drugi wiersz (`message`).
 */
import { toast } from 'react-native-pretty-toast';
import type { ShowOptions, ToastConfig } from 'react-native-pretty-toast';
import { toDomainError } from '../services/errors';
import i18n from './i18n';
import { notify as hapticNotify } from './haptics';

const NOTIFY_ERROR_DURATION_MS = 5000;
const NOTIFY_PLACEHOLDER_MESSAGE = ' ';

type ExtraToastFields = Omit<ToastConfig, 'title'>;

function normalizeToastFields(extra?: ExtraToastFields): ExtraToastFields {
  const normalizedMessage = extra?.message?.trim();
  return {
    ...extra,
    // Keep a stable two-line layout so every toast has the same visual height.
    message: normalizedMessage && normalizedMessage.length > 0 ? normalizedMessage : NOTIFY_PLACEHOLDER_MESSAGE,
  };
}

export function notifySuccess(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  hapticNotify('success');
  return toast.success(title.trim(), normalizeToastFields(extra), options);
}

export function notifyError(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  hapticNotify('error');
  return toast.error(title.trim(), { duration: NOTIFY_ERROR_DURATION_MS, ...normalizeToastFields(extra) }, options);
}

export function notifyInfo(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  return toast.info(title.trim(), normalizeToastFields(extra), options);
}

export function notifyWarning(title: string, extra?: ExtraToastFields, options?: ShowOptions): string {
  hapticNotify('warning');
  return toast.warning(title.trim(), normalizeToastFields(extra), options);
}

export function notifyShow(config: ToastConfig, options?: ShowOptions): string {
  const normalizedTitle = config.title?.trim();
  const { title: _title, ...restConfig } = config;
  return toast.show(
    {
      ...restConfig,
      title: normalizedTitle,
      ...normalizeToastFields(restConfig),
    },
    options
  );
}

export function notifyDomainError(err: unknown, fallbackMessage: string, options?: ShowOptions): string {
  const domainError = toDomainError(err, fallbackMessage);
  const translatedByCode = i18n.t(domainError.messageKey, {
    ...(domainError.messageParams ?? {}),
    defaultValue: domainError.message,
  });
  return notifyError(translatedByCode, undefined, options);
}
