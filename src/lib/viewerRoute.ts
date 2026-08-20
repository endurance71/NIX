export type ViewerOpenParams = {
  id: string;
  path: string;
  senderId: string;
  mediaType: 'image' | 'video';
  viewDurationSec: number;
  playbackDurationMs: number | null;
  thumbnailB64: string | null;
  isReplay: boolean;
};

export function serializeViewerOpenParams(params: ViewerOpenParams) {
  return {
    id: params.id,
    path: params.path,
    senderId: params.senderId,
    mediaType: params.mediaType,
    viewDurationSec: String(params.viewDurationSec),
    playbackDurationMs: params.playbackDurationMs == null ? '' : String(params.playbackDurationMs),
    thumbnailB64: params.thumbnailB64 ?? '',
    isReplay: params.isReplay ? '1' : '0',
  };
}

export type ViewerFailureKind = 'unauthorized' | 'transient' | 'permanentMissing';

export function classifyViewerFailure(error: unknown): ViewerFailureKind {
  const candidate = error as { status?: number; statusCode?: number | string; message?: string; code?: string } | null;
  const status = Number(candidate?.status ?? candidate?.statusCode);
  const message = `${candidate?.message ?? ''} ${candidate?.code ?? ''}`.toLowerCase();
  if (status === 401 || message.includes('jwt') || message.includes('unauthorized')) return 'unauthorized';
  if (status === 404 || message.includes('not found') || message.includes('object does not exist')) return 'permanentMissing';
  return 'transient';
}
