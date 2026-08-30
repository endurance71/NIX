import {
  cleanupOwnedTemporaryUris,
  isOwnedPasteTempUri,
  pasteCacheDirectory,
} from './ownedTemporaryFiles';

/** Keep in lockstep with `MAX_IMAGE_FILE_SIZE_BYTES` in mediaService. */
export const CHAT_PASTE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const CHAT_PASTE_MAX_LONG_EDGE = 8192;
export const CHAT_PASTE_MAX_PIXELS = 48_000_000;

export type ChatPastePayload =
  | { type: 'text'; value: string }
  | { type: 'images'; uris: string[] }
  | { type: 'unsupported' };

export type ChatPasteErrorCode =
  | 'multiple_images'
  | 'animated'
  | 'unreadable'
  | 'unsupported_format';

export type ChatPasteImageSuccess = {
  ok: true;
  uri: string;
  width: number;
  height: number;
  ownedTemporaryUris: string[];
};

export type ChatPasteFailure = {
  ok: false;
  code: ChatPasteErrorCode;
};

export type ChatPasteImageResult = ChatPasteImageSuccess | ChatPasteFailure;

export type ChatPasteIo = {
  cacheDirectory: string | null;
  getInfo: (uri: string) => Promise<{ exists: boolean; size?: number }>;
  readHeaderBytes: (uri: string, length: number) => Promise<Uint8Array>;
  getImageSize: (uri: string) => Promise<{ width: number; height: number }>;
  normalizeImage: (
    uri: string,
    format: 'jpeg' | 'png'
  ) => Promise<{ uri: string; width: number; height: number }>;
  makeDirectory: (uri: string) => Promise<void>;
  copyAsync: (from: string, to: string) => Promise<void>;
  deleteAsync: (uri: string) => Promise<void>;
};

export type SniffedImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'heif' | 'unknown';

function bytesStartWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readU32Le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

export function sniffImageKind(bytes: Uint8Array): SniffedImageKind {
  if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (
    bytes.length >= 12
    && asciiAt(bytes, 0, 4) === 'RIFF'
    && asciiAt(bytes, 8, 4) === 'WEBP'
  ) {
    return 'webp';
  }
  if (bytes.length >= 12 && asciiAt(bytes, 4, 4) === 'ftyp') {
    const brand = asciiAt(bytes, 8, 4);
    if (
      brand === 'heic'
      || brand === 'heix'
      || brand === 'heif'
      || brand === 'mif1'
      || brand === 'msf1'
    ) {
      return 'heif';
    }
  }
  return 'unknown';
}

export function isAnimatedWebP(bytes: Uint8Array): boolean {
  if (sniffImageKind(bytes) !== 'webp' || bytes.length < 21) return false;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = asciiAt(bytes, offset, 4);
    const chunkSize = readU32Le(bytes, offset + 4);
    if (fourcc === 'ANIM') return true;
    if (fourcc === 'VP8X' && offset + 9 <= bytes.length) {
      const flags = bytes[offset + 8];
      if ((flags & 0x02) !== 0) return true;
    }
    const paddedSize = chunkSize + (chunkSize % 2);
    const next = offset + 8 + paddedSize;
    if (next <= offset) break;
    offset = next;
  }
  return false;
}

export function isLocalFileUri(uri: string): boolean {
  return typeof uri === 'string' && uri.startsWith('file://');
}

export function isRejectedPasteScheme(uri: string): boolean {
  if (typeof uri !== 'string' || uri.length === 0) return true;
  const lower = uri.toLowerCase();
  return (
    lower.startsWith('http://')
    || lower.startsWith('https://')
    || lower.startsWith('data:')
    || lower.startsWith('ph://')
    || lower.startsWith('assets-library://')
    || lower.startsWith('content://')
    || lower.startsWith('ph-upload://')
  );
}

function randomPasteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `paste-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fail(code: ChatPasteErrorCode): ChatPasteFailure {
  return { ok: false, code };
}

async function cleanupCreated(
  uris: readonly string[],
  io: ChatPasteIo
): Promise<void> {
  await cleanupOwnedTemporaryUris(uris, {
    cacheDirectory: io.cacheDirectory,
    deleteAsync: io.deleteAsync,
  });
}

/**
 * Validate and normalize a pasted image payload. Never logs URI, filename, or bytes.
 * Text paste is intentionally ignored here — the native TextInput already inserted it.
 */
export async function importPastedImages(
  payload: ChatPastePayload,
  io: ChatPasteIo
): Promise<ChatPasteImageResult> {
  if (payload.type === 'text') {
    return fail('unsupported_format');
  }
  if (payload.type === 'unsupported') {
    return fail('unsupported_format');
  }

  const uris = payload.uris;
  if (!Array.isArray(uris) || uris.length === 0) {
    return fail('unreadable');
  }
  if (uris.length > 1) {
    return fail('multiple_images');
  }

  const sourceUri = uris[0];
  const created: string[] = [];

  try {
    if (typeof sourceUri !== 'string' || sourceUri.length === 0) {
      return fail('unreadable');
    }
    if (isRejectedPasteScheme(sourceUri) || !isLocalFileUri(sourceUri)) {
      return fail('unsupported_format');
    }
    if (sourceUri.includes('..')) {
      return fail('unsupported_format');
    }

    const info = await io.getInfo(sourceUri);
    if (!info.exists) {
      return fail('unreadable');
    }
    const size = typeof info.size === 'number' ? info.size : 0;
    if (size <= 0) {
      return fail('unreadable');
    }
    if (size > CHAT_PASTE_MAX_IMAGE_BYTES) {
      return fail('unreadable');
    }

    const header = await io.readHeaderBytes(sourceUri, 64);
    const kind = sniffImageKind(header);
    if (kind === 'gif') {
      return fail('animated');
    }
    if (kind === 'webp' && isAnimatedWebP(header)) {
      return fail('animated');
    }

    let width = 0;
    let height = 0;
    try {
      const dimensions = await io.getImageSize(sourceUri);
      width = dimensions.width;
      height = dimensions.height;
    } catch {
      return fail('unreadable');
    }

    if (
      !Number.isFinite(width)
      || !Number.isFinite(height)
      || width <= 0
      || height <= 0
    ) {
      return fail('unreadable');
    }
    if (
      Math.max(width, height) > CHAT_PASTE_MAX_LONG_EDGE
      || width * height > CHAT_PASTE_MAX_PIXELS
    ) {
      return fail('unreadable');
    }

    const pasteDir = pasteCacheDirectory(io.cacheDirectory);
    if (!pasteDir) {
      return fail('unreadable');
    }
    await io.makeDirectory(pasteDir);

    const format: 'jpeg' | 'png' = kind === 'jpeg' ? 'jpeg' : 'png';
    let normalized;
    try {
      normalized = await io.normalizeImage(sourceUri, format);
    } catch {
      return fail('unreadable');
    }

    const destUri = `${pasteDir}${randomPasteId()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    if (!isOwnedPasteTempUri(destUri, io.cacheDirectory)) {
      return fail('unreadable');
    }

    await io.copyAsync(normalized.uri, destUri);
    created.push(destUri);

    if (normalized.uri !== destUri) {
      try {
        await io.deleteAsync(normalized.uri);
      } catch {
        // Manipulator temp may live outside nix-paste; best-effort only.
      }
    }

    const destInfo = await io.getInfo(destUri);
    if (!destInfo.exists || !destInfo.size || destInfo.size <= 0) {
      await cleanupCreated(created, io);
      return fail('unreadable');
    }

    return {
      ok: true,
      uri: destUri,
      width: normalized.width || width,
      height: normalized.height || height,
      ownedTemporaryUris: [destUri],
    };
  } catch {
    await cleanupCreated(created, io);
    return fail('unreadable');
  }
}

export function chatPasteMessageKey(code: ChatPasteErrorCode): string {
  switch (code) {
    case 'multiple_images':
      return 'chat.pasteMultipleImages';
    case 'animated':
      return 'chat.pasteAnimatedUnsupported';
    case 'unsupported_format':
      return 'chat.pasteUnsupportedFormat';
    case 'unreadable':
      return 'chat.pasteUnreadable';
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}
