import { Alert, Linking } from 'react-native';
import i18n from './i18n';
import { notifyError, notifySuccess } from './appNotify';
import { tap } from './haptics';
import { trackEvent } from './telemetry';
import {
  ensureWritePermission,
  saveLocalUrisToLibrary,
  saveRemoteUriToLibrary,
} from './saveToMediaLibrary';
import { bakeMediaOverlays, releaseBakedOverlayUris } from './bakeMediaTextOverlay';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../types/mediaDrawingOverlay';

export type SaveToGallerySource = 'preview' | 'viewer';

type SaveLocalArgs = {
  source: SaveToGallerySource;
  uris: string[];
  mediaType: 'image' | 'video';
  segmentCount?: number;
  textOverlay?: MediaTextOverlay | null;
  drawingOverlay?: MediaDrawingOverlay | null;
};

type SaveRemoteArgs = {
  source: 'viewer';
  remoteUri: string;
  mediaType: 'image' | 'video';
  extHint?: string;
};

function permissionBlockedAlert() {
  Alert.alert(
    i18n.t('media.savePermissionBlockedTitle'),
    i18n.t('media.savePermissionBlockedMessage'),
    [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      {
        text: i18n.t('push.openSettings'),
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ]
  );
}

async function withWritePermission(run: () => Promise<void>, source: SaveToGallerySource, extra: Record<string, unknown>) {
  tap('light');
  const permission = await ensureWritePermission();
  if (permission === 'blocked') {
    trackEvent(`${source}_save_to_gallery`, { ...extra, outcome: 'blocked' });
    permissionBlockedAlert();
    return false;
  }
  if (permission === 'denied') {
    trackEvent(`${source}_save_to_gallery`, { ...extra, outcome: 'denied' });
    notifyError(i18n.t('media.savePermissionDenied'));
    return false;
  }

  try {
    await run();
    trackEvent(`${source}_save_to_gallery`, { ...extra, outcome: 'success' });
    notifySuccess(i18n.t('media.saveSuccess'));
    return true;
  } catch (error) {
    console.warn(`[${source}] save to gallery failed`, error);
    trackEvent(`${source}_save_to_gallery`, { ...extra, outcome: 'failed' });
    notifyError(i18n.t('media.saveFailed'));
    return false;
  }
}

export async function saveLocalMediaToGallery(args: SaveLocalArgs): Promise<boolean> {
  const extra = {
    mediaType: args.mediaType,
    segmentCount: args.segmentCount ?? args.uris.length,
    has_text_overlay: Boolean(args.textOverlay?.text?.trim()),
    has_drawing_overlay: Boolean(args.drawingOverlay?.data),
  };
  return withWritePermission(async () => {
    const temporaryUris: string[] = [];
    try {
      const urisToSave: string[] = [];
      for (const uri of args.uris) {
        const baked = await bakeMediaOverlays({
          uri,
          mediaType: args.mediaType,
          textOverlay: args.textOverlay,
          drawingOverlay: args.drawingOverlay,
        });
        urisToSave.push(baked.uri);
        temporaryUris.push(...baked.temporaryUris);
      }
      await saveLocalUrisToLibrary(urisToSave);
    } finally {
      void releaseBakedOverlayUris(temporaryUris);
    }
  }, args.source, extra);
}

export async function saveRemoteMediaToGallery(args: SaveRemoteArgs): Promise<boolean> {
  const extra = { mediaType: args.mediaType };
  return withWritePermission(
    () => saveRemoteUriToLibrary(args.remoteUri, args.extHint),
    args.source,
    extra
  );
}
