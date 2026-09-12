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
  jobId?: string | null;
  sentCount?: number;
  rejectedCount?: number;
  recipients?: {
    receiverId: string;
    status: 'sent' | 'rejected';
    nixId?: string;
    errorCode?: string;
  }[];
};

const MODERATION_POLL_INTERVAL_MS = 400;
const MODERATION_POLL_TIMEOUT_MS = 30_000;

type MediaModerationJobView = {
  jobId?: string;
  status?: string;
  decision?: string | null;
  nixId?: string | null;
  batchStatus?: string | null;
};

function errorText(error: { message?: string; code?: string } | null | undefined): string {
  return `${error?.code ?? ''} ${error?.message ?? ''}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asMediaJobView(data: unknown): MediaModerationJobView | null {
  if (!data || typeof data !== 'object') return null;
  return data as MediaModerationJobView;
}

export type SettledMediaModeration = {
  status: 'completed' | 'partially_completed';
  nixId: string | null;
};

export async function waitForOwnMediaJob(jobId: string): Promise<SettledMediaModeration> {
  const deadline = Date.now() + MODERATION_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data, error } = await supabase.rpc('get_own_media_moderation_job', {
      p_job_id: jobId,
    });
    if (error) {
      const text = errorText(error);
      if (text.includes('UNAUTHORIZED')) {
        throw new DomainError('UNAUTHORIZED', 'Wymagane logowanie.');
      }
      throw new DomainError('UNKNOWN', error.message || 'Nie udało się sprawdzić moderacji.');
    }

    const job = asMediaJobView(data);
    const status = job?.status ?? '';
    switch (status) {
      case 'pending':
      case 'processing':
        await sleep(MODERATION_POLL_INTERVAL_MS);
        break;
      case 'approved': {
        const batchStatus = job?.batchStatus;
        if (batchStatus === 'completed' || batchStatus === 'partially_completed') {
          return {
            status: batchStatus,
            nixId: typeof job?.nixId === 'string' ? job.nixId : null,
          };
        }
        await sleep(MODERATION_POLL_INTERVAL_MS);
        break;
      }
      case 'rejected':
        throw new DomainError('CONTENT_NOT_ALLOWED', 'Ta wiadomość nie może zostać wysłana.');
      case 'error':
        throw new DomainError('UNKNOWN', 'Moderacja nie powiodła się. Spróbuj ponownie.');
      default:
        throw new DomainError('UNKNOWN', 'Nie udało się wysłać wiadomości.');
    }
  }

  throw new DomainError('UNKNOWN', 'Moderacja trwa zbyt długo. Spróbuj ponownie.');
}

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
