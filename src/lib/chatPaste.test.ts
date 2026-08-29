import { describe, expect, it } from 'vitest';
import {
  CHAT_PASTE_MAX_IMAGE_BYTES,
  importPastedImages,
  isAnimatedWebP,
  sniffImageKind,
  type ChatPasteIo,
} from './chatPaste';

const CACHE = 'file:///cache/';
const SOURCE = 'file:///tmp/pasted.bin';
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF_HEADER = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

function webpHeader(kind: 'vp8' | 'animated'): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  if (kind === 'vp8') {
    bytes.set([0x56, 0x50, 0x38, 0x20], 12);
    return bytes;
  }
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  bytes[16] = 10;
  bytes[20] = 0x02;
  return bytes;
}

function createIo(overrides: Partial<ChatPasteIo> & { header?: Uint8Array } = {}): ChatPasteIo & {
  deleted: string[];
  copied: { from: string; to: string }[];
  normalized: boolean;
} {
  const deleted: string[] = [];
  const copied: { from: string; to: string }[] = [];
  const files = new Map<string, number>([[SOURCE, 12_000]]);
        const { header, ...rest } = overrides;
        const io: ChatPasteIo & {
          deleted: string[];
          copied: { from: string; to: string }[];
          normalized: boolean;
        } = {
          deleted,
          copied,
          normalized: false,
          cacheDirectory: CACHE,
          getInfo: async (uri) => {
            const size = files.get(uri);
            if (size == null) return { exists: false };
            return { exists: true, size };
          },
          readHeaderBytes: async () => header ?? JPEG_HEADER,
          getImageSize: async () => ({ width: 800, height: 600 }),
          normalizeImage: async () => {
            io.normalized = true;
            return { uri: 'file:///cache/manipulator-out.jpg', width: 800, height: 600 };
          },
          makeDirectory: async () => undefined,
          copyAsync: async (from, to) => {
            copied.push({ from, to });
            files.set(to, 8_000);
          },
          deleteAsync: async (uri) => {
            deleted.push(uri);
            files.delete(uri);
          },
          ...rest,
        };
  return io;
}

describe('sniffImageKind', () => {
  it('rozpoznaje JPEG, PNG, GIF i WebP niezależnie od rozszerzenia', () => {
    expect(sniffImageKind(JPEG_HEADER)).toBe('jpeg');
    expect(sniffImageKind(PNG_HEADER)).toBe('png');
    expect(sniffImageKind(GIF_HEADER)).toBe('gif');
    expect(sniffImageKind(webpHeader('vp8'))).toBe('webp');
  });

  it('wykrywa animowany WebP po fladze VP8X', () => {
    expect(isAnimatedWebP(webpHeader('animated'))).toBe(true);
    expect(isAnimatedWebP(webpHeader('vp8'))).toBe(false);
  });
});

describe('importPastedImages', () => {
  it('przyjmuje lokalny JPEG i zapisuje owned temp', async () => {
    const io = createIo({ header: JPEG_HEADER });
    const result = await importPastedImages({ type: 'images', uris: [SOURCE] }, io);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uri.startsWith('file:///cache/nix-paste/')).toBe(true);
    expect(result.ownedTemporaryUris).toEqual([result.uri]);
    expect(result.width).toBe(800);
    expect(io.normalized).toBe(true);
  });

  it('przyjmuje PNG i statyczny WebP', async () => {
    await expect(
      importPastedImages({ type: 'images', uris: [SOURCE] }, createIo({ header: PNG_HEADER }))
    ).resolves.toMatchObject({ ok: true });
    await expect(
      importPastedImages(
        { type: 'images', uris: [SOURCE] },
        createIo({ header: webpHeader('vp8') })
      )
    ).resolves.toMatchObject({ ok: true });
  });

  it('odrzuca GIF i animowany WebP przed normalizacją', async () => {
    const gifIo = createIo({ header: GIF_HEADER });
    await expect(importPastedImages({ type: 'images', uris: [SOURCE] }, gifIo)).resolves.toEqual({
      ok: false,
      code: 'animated',
    });
    expect(gifIo.normalized).toBe(false);

    const webpIo = createIo({ header: webpHeader('animated') });
    await expect(importPastedImages({ type: 'images', uris: [SOURCE] }, webpIo)).resolves.toEqual({
      ok: false,
      code: 'animated',
    });
    expect(webpIo.normalized).toBe(false);
  });

  it('odrzuca zero i więcej niż jeden URI bez wybierania pierwszego', async () => {
    const io = createIo();
    await expect(importPastedImages({ type: 'images', uris: [] }, io)).resolves.toEqual({
      ok: false,
      code: 'unreadable',
    });
    await expect(
      importPastedImages({ type: 'images', uris: [SOURCE, 'file:///tmp/b.jpg'] }, io)
    ).resolves.toEqual({ ok: false, code: 'multiple_images' });
    expect(io.normalized).toBe(false);
  });

  it('odrzuca http, https, data i ph', async () => {
    const io = createIo();
    for (const uri of ['http://example.invalid/a.jpg', 'https://example.invalid/a.jpg', 'data:image/png;base64,aa', 'ph://asset']) {
      await expect(importPastedImages({ type: 'images', uris: [uri] }, io)).resolves.toEqual({
        ok: false,
        code: 'unsupported_format',
      });
    }
    expect(io.normalized).toBe(false);
  });

  it('odrzuca nieistniejący, pusty i za duży plik', async () => {
    await expect(
      importPastedImages(
        { type: 'images', uris: [SOURCE] },
        createIo({ getInfo: async () => ({ exists: false }) })
      )
    ).resolves.toEqual({ ok: false, code: 'unreadable' });

    await expect(
      importPastedImages(
        { type: 'images', uris: [SOURCE] },
        createIo({ getInfo: async () => ({ exists: true, size: 0 }) })
      )
    ).resolves.toEqual({ ok: false, code: 'unreadable' });

    await expect(
      importPastedImages(
        { type: 'images', uris: [SOURCE] },
        createIo({ getInfo: async () => ({ exists: true, size: CHAT_PASTE_MAX_IMAGE_BYTES + 1 }) })
      )
    ).resolves.toEqual({ ok: false, code: 'unreadable' });
  });

  it('odrzuca uszkodzony obraz i nie zostawia owned temp', async () => {
    const io = createIo({
      getImageSize: async () => {
        throw new Error('decode failed');
      },
    });
    const result = await importPastedImages({ type: 'images', uris: [SOURCE] }, io);
    expect(result).toEqual({ ok: false, code: 'unreadable' });
    expect(io.copied).toEqual([]);
  });

  it('po błędzie normalizacji sprząta utworzone pliki i nie zwraca draftu', async () => {
    const io = createIo({
      normalizeImage: async () => {
        throw new Error('manipulator failed');
      },
    });
    const result = await importPastedImages({ type: 'images', uris: [SOURCE] }, io);
    expect(result.ok).toBe(false);
    expect(io.copied).toEqual([]);
  });

  it('nie traktuje payloadu tekstowego jako obrazu', async () => {
    const io = createIo();
    await expect(importPastedImages({ type: 'text', value: 'hello' }, io)).resolves.toEqual({
      ok: false,
      code: 'unsupported_format',
    });
    expect(io.normalized).toBe(false);
  });
});

describe('CHAT_PASTE_MAX_IMAGE_BYTES', () => {
  it('jest zsynchronizowany z limitem uploadu obrazów', () => {
    expect(CHAT_PASTE_MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});
