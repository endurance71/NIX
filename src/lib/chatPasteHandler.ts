import type { PhotoDraftData } from '../context/photoDraft';
import {
  chatPasteMessageKey,
  importPastedImages,
  type ChatPasteIo,
  type ChatPastePayload,
} from './chatPaste';

export type ChatPasteHandlerDeps = {
  isImporting: () => boolean;
  setImporting: (value: boolean) => void;
  setDraft: (draft: PhotoDraftData) => void;
  peerId: string;
  t: (key: string) => string;
  notifyError: (title: string) => void;
  notifySuccess: (title: string) => void;
  announce: (message: string) => void;
  openPreview: (recipientId: string) => void;
  pasteIo: ChatPasteIo;
};

/**
 * Text paste must not write composer state: expo-paste-input fires after the
 * native TextInput has already inserted the string via onChangeText.
 */
export async function handleChatPastePayload(
  payload: ChatPastePayload,
  deps: ChatPasteHandlerDeps
): Promise<void> {
  if (payload.type === 'text') {
    return;
  }

  if (deps.isImporting()) {
    return;
  }

  if (payload.type === 'unsupported') {
    deps.notifyError(deps.t('chat.pasteUnsupportedFormat'));
    return;
  }

  deps.setImporting(true);
  try {
    const result = await importPastedImages(payload, deps.pasteIo);
    if (!result.ok) {
      deps.notifyError(deps.t(chatPasteMessageKey(result.code)));
      return;
    }

    deps.setDraft({
      uri: result.uri,
      width: result.width,
      height: result.height,
      ownedTemporaryUris: result.ownedTemporaryUris,
    });
    const added = deps.t('chat.pasteImageAdded');
    deps.notifySuccess(added);
    deps.announce(added);
    deps.openPreview(deps.peerId);
  } finally {
    deps.setImporting(false);
  }
}
