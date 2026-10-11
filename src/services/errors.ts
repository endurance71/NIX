export type DomainErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_RECEIVER'
  | 'INVALID_INPUT'
  | 'NOT_FRIEND'
  | 'RATE_LIMITED'
  | 'INVALID_MEDIA'
  | 'INVALID_SIZE'
  | 'MEDIA_TOO_LARGE'
  | 'OBJECT_SIZE_MISMATCH'
  | 'CLEANUP_FAILED'
  | 'CANCELLED'
  | 'NOT_FOUND'
  | 'CONTENT_NOT_ALLOWED'
  | 'FORBIDDEN'
  | 'USERNAME_TOO_SHORT'
  | 'CANNOT_ADD_SELF'
  | 'FRIENDSHIP_EXISTS'
  | 'FRIEND_REQUEST_NOT_FOUND'
  | 'EDIT_WINDOW_CLOSED'
  | 'EDIT_LIMIT_REACHED'
  | 'UNKNOWN';

export class DomainError extends Error {
  code: DomainErrorCode;
  messageKey: string;
  messageParams?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, messageParams?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.messageKey = `domainErrors.${code}`;
    this.messageParams = messageParams;
  }
}

export function toDomainError(err: unknown, fallbackMessage: string) {
  if (err instanceof DomainError) return err;
  if (err instanceof Error) return new DomainError('UNKNOWN', err.message || fallbackMessage);
  return new DomainError('UNKNOWN', fallbackMessage);
}

const NETWORK_ERROR_NAMES = new Set(['AuthRetryableFetchError', 'FunctionsFetchError', 'StorageUnknownError']);
const NETWORK_ERROR_MESSAGE =
  /network request failed|failed to fetch|fetch failed|network error|internet connection appears to be offline|request timed out|could not connect to the server/i;

/** Transport failures (offline, DNS, timeouts) — not a server verdict about the request. */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (typeof name === 'string' && NETWORK_ERROR_NAMES.has(name)) {
    return name !== 'StorageUnknownError' || (typeof message === 'string' && NETWORK_ERROR_MESSAGE.test(message));
  }
  return typeof message === 'string' && NETWORK_ERROR_MESSAGE.test(message);
}
