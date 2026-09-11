import { supabase } from '../lib/supabase';
import type { DurableUploadRecipient } from '../types/uploadQueue';
import { DomainError } from './errors';

export type BeginMediaUploadResponse = {
  batchId: string;
  assetId: string;
  storagePath: string;
  status: string;
  upload: {
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expiresAt: string;
  };
  finalize: {
    url: string;
    token: string;
    headers: Record<string, string>;
  };
  retentionExpiresAt: string;
};

export type FinalizeMediaUploadResponse = {
  ok: boolean;
  batchId: string;
  assetId: string;
  status: 'completed' | 'partially_completed' | 'failed' | 'moderation_pending';
  jobId?: string;
  sentCount?: number;
  rejectedCount?: number;
  recipients?: {
    receiverId: string;
    status: 'sent' | 'rejected';
    nixId?: string;
    errorCode?: string;
  }[];
};

async function edgeError(
  error: { message?: string; context?: unknown } | null,
  fallback: string
) {
  let serverCode = '';
  let serverMessage = '';
  if (error?.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as {
        code?: unknown;
        error?: unknown;
      };
      serverCode = typeof payload.code === 'string' ? payload.code : '';
      serverMessage = typeof payload.error === 'string' ? payload.error : '';
    } catch {
      // The transport message remains the fallback for non-JSON failures.
    }
  }
  const message = `${serverCode} ${serverMessage} ${error?.message ?? fallback}`.trim();
  if (message.includes('RATE_LIMITED')) return new DomainError('RATE_LIMITED', 'Limit wysyłek został przekroczony.');
  if (message.includes('AUTH_REQUIRED') || message.includes('INVALID_FINALIZE_TOKEN')) {
    return new DomainError('UNAUTHORIZED', 'Sesja użytkownika wygasła.');
  }
  if (message.includes('NOT_FRIEND') || message.includes('RECIPIENT_UNAVAILABLE')) {
    return new DomainError('NOT_FRIEND', 'Co najmniej jeden odbiorca jest niedostępny.');
  }
  if (message.includes('INVALID_MEDIA')) return new DomainError('INVALID_MEDIA', 'Nieprawidłowy plik multimedialny.');
  if (message.includes('CONTENT_NOT_ALLOWED')) {
    return new DomainError('CONTENT_NOT_ALLOWED', 'Ta treść nie może zostać wysłana.');
  }
  if (message.includes('MODERATION_PENDING')) {
    return new DomainError('MODERATION_PENDING', 'Treść oczekuje na weryfikację.');
  }
  if (message.includes('MODERATION_RETRYABLE')) {
    return new DomainError('MODERATION_RETRYABLE', 'Weryfikacja treści jest chwilowo niedostępna.');
  }
  return new DomainError('UNKNOWN', message);
}

export async function beginMediaUploadBatch(input: {
  idempotencyKey: string;
  mediaType: 'image' | 'video';
  contentType: string;
  sizeBytes: number;
  fileExtension: string;
  playbackDurationMs?: number | null;
  thumbnailB64?: string | null;
  recipients: DurableUploadRecipient[];
}) {
  const { data, error } = await supabase.functions.invoke<BeginMediaUploadResponse>(
    'begin-media-upload',
    {
      body: {
        idempotencyKey: input.idempotencyKey,
        mediaType: input.mediaType,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        fileExtension: input.fileExtension,
        playbackDurationMs: input.playbackDurationMs == null
          ? null
          : Math.round(input.playbackDurationMs),
        thumbnailB64: input.thumbnailB64 ?? null,
        recipients: input.recipients,
      },
    }
  );
  if (error || !data) throw await edgeError(error, 'Nie udało się rozpocząć wysyłki.');
  return data;
}

export async function finalizeMediaUploadBatch(input: {
  url: string;
  headers: Record<string, string>;
  batchId: string;
  token: string;
}) {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: input.headers,
    body: JSON.stringify({ batchId: input.batchId, token: input.token }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new DomainError('UNAUTHORIZED', 'Sesja użytkownika wygasła.');
    }
    const errorPayload = await response.json().catch(() => null) as {
      error?: string;
      code?: string;
    } | null;
    const code = errorPayload?.code ?? '';
    if (code === 'CONTENT_NOT_ALLOWED') {
      throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta treść nie może zostać wysłana.');
    }
    if (code === 'MODERATION_RETRYABLE') {
      throw new DomainError('MODERATION_RETRYABLE', 'Weryfikacja treści jest chwilowo niedostępna.');
    }
    throw new DomainError(
      'UNKNOWN',
      errorPayload?.error || `Finalizacja wysyłki nie powiodła się (${response.status}).`
    );
  }
  const payload = await response.json().catch(() => null) as FinalizeMediaUploadResponse | null;
  if (!payload || !('ok' in payload)) {
    throw new DomainError('UNKNOWN', 'Serwer zwrócił nieprawidłową odpowiedź finalizacji.');
  }
  return payload;
}

export async function cancelMediaUploadBatch(batchId: string) {
  const { error } = await supabase.functions.invoke('cancel-media-upload', {
    body: { batchId },
  });
  if (error) throw await edgeError(error, 'Nie udało się anulować wysyłki.');
}
