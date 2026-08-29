import { describe, expect, it, vi } from 'vitest';
import { handleChatPastePayload } from './chatPasteHandler';
import type { ChatPasteIo } from './chatPaste';
import { CHAT_PASTE_MAX_IMAGE_BYTES } from './chatPaste';

const SOURCE = 'file:///tmp/pasted.jpg';
const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);

function createIo(success = true): ChatPasteIo {
  const files = new Map<string, number>([[SOURCE, 4_000]]);
  return {
    cacheDirectory: 'file:///cache/',
    getInfo: async (uri) => {
      const size = files.get(uri);
      return size == null ? { exists: false } : { exists: true, size };
    },
    readHeaderBytes: async () => JPEG_HEADER,
    getImageSize: async () => ({ width: 100, height: 80 }),
    normalizeImage: async () => {
      if (!success) throw new Error('nope');
      return { uri: 'file:///cache/out.jpg', width: 100, height: 80 };
    },
    makeDirectory: async () => undefined,
    copyAsync: async (_from, to) => {
      files.set(to, 3_000);
    },
    deleteAsync: async (uri) => {
      files.delete(uri);
    },
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const setInputBody = vi.fn();
  const setDraft = vi.fn();
  const notifyError = vi.fn();
  const notifySuccess = vi.fn();
  const announce = vi.fn();
  const openPreview = vi.fn();
  const setImporting = vi.fn();
  let importing = false;
  return {
    setInputBody,
    deps: {
      isImporting: () => importing,
      setImporting: (value: boolean) => {
        importing = value;
        setImporting(value);
      },
      setDraft,
      peerId: 'peer-1',
      t: (key: string) => key,
      notifyError,
      notifySuccess,
      announce,
      openPreview,
      pasteIo: createIo(true),
      ...overrides,
    },
    spies: { setInputBody, setDraft, notifyError, notifySuccess, announce, openPreview, setImporting },
  };
}

describe('handleChatPastePayload', () => {
  it('dla tekstu nie woła setInputBody, draftu ani preview', async () => {
    const { deps, spies } = createDeps();
    await handleChatPastePayload({ type: 'text', value: 'wklejony tekst' }, deps);
    expect(spies.setInputBody).not.toHaveBeenCalled();
    expect(spies.setDraft).not.toHaveBeenCalled();
    expect(spies.openPreview).not.toHaveBeenCalled();
    expect(spies.notifyError).not.toHaveBeenCalled();
  });

  it('unsupported nie czyści draftu ani tekstu', async () => {
    const { deps, spies } = createDeps();
    await handleChatPastePayload({ type: 'unsupported' }, deps);
    expect(spies.setDraft).not.toHaveBeenCalled();
    expect(spies.setInputBody).not.toHaveBeenCalled();
    expect(spies.notifyError).toHaveBeenCalledWith('chat.pasteUnsupportedFormat');
    expect(spies.openPreview).not.toHaveBeenCalled();
  });

  it('przyjęty obraz trafia do PhotoDraft i preview bez uploadu', async () => {
    const { deps, spies } = createDeps();
    await handleChatPastePayload({ type: 'images', uris: [SOURCE] }, deps);
    expect(spies.setDraft).toHaveBeenCalledTimes(1);
    const draft = spies.setDraft.mock.calls[0][0];
    expect(draft.uri.startsWith('file:///cache/nix-paste/')).toBe(true);
    expect(draft.ownedTemporaryUris).toEqual([draft.uri]);
    expect(spies.openPreview).toHaveBeenCalledWith('peer-1');
    expect(spies.notifySuccess).toHaveBeenCalledWith('chat.pasteImageAdded');
    expect(spies.announce).toHaveBeenCalledWith('chat.pasteImageAdded');
    expect(spies.setImporting).toHaveBeenCalledWith(true);
    expect(spies.setImporting).toHaveBeenLastCalledWith(false);
  });

  it('po błędzie nie otwiera preview i nie ustawia draftu', async () => {
    const { deps, spies } = createDeps({ pasteIo: createIo(false) });
    await handleChatPastePayload({ type: 'images', uris: [SOURCE] }, deps);
    expect(spies.setDraft).not.toHaveBeenCalled();
    expect(spies.openPreview).not.toHaveBeenCalled();
    expect(spies.notifyError).toHaveBeenCalled();
  });

  it('chroni przed wielokrotnym importem', async () => {
    const { deps, spies } = createDeps({ isImporting: () => true });
    await handleChatPastePayload({ type: 'images', uris: [SOURCE] }, deps);
    expect(spies.setDraft).not.toHaveBeenCalled();
    expect(spies.openPreview).not.toHaveBeenCalled();
  });

  it('limit bajtów pozostaje wspólny z pipeline mediów', () => {
    expect(CHAT_PASTE_MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
  });
});
