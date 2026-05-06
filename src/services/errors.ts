export type DomainErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_RECEIVER'
  | 'INVALID_INPUT'
  | 'NOT_FRIEND'
  | 'RATE_LIMITED'
  | 'INVALID_MEDIA'
  | 'CLEANUP_FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export class DomainError extends Error {
  code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function toDomainError(err: unknown, fallbackMessage: string) {
  if (err instanceof DomainError) return err;
  if (err instanceof Error) return new DomainError('UNKNOWN', err.message || fallbackMessage);
  return new DomainError('UNKNOWN', fallbackMessage);
}
