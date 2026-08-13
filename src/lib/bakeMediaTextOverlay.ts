import { Dimensions } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  bakeOverlaysOnImageAsync,
  bakeOverlaysOnVideoAsync,
  isNixMediaOverlayAvailable,
} from '../../modules/nix-media-overlay';
import { nowMs, trackDuration, trackEvent } from './telemetry';
import {
  normalizeMediaTextOverlay,
  type MediaTextOverlayInput,
} from '../types/mediaTextOverlay';
import {
  normalizeMediaDrawingOverlay,
  type MediaDrawingOverlayInput,
} from '../types/mediaDrawingOverlay';

const BAKE_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}nix-text-overlay/`;

export type BakeMediaTextOverlayResult = {
  uri: string;
  /** True when a new temporary file was created and should be cleaned up later. */
  didBake: boolean;
  temporaryUris: string[];
};

export type BakeMediaOverlaysResult = BakeMediaTextOverlayResult;

function defaultViewport() {
  const { width, height } = Dimensions.get('window');
  return { viewportWidth: width, viewportHeight: height };
}

function extensionFor(mediaType: 'image' | 'video', sourceUri: string): string {
  const fromUri = sourceUri.split('?')[0].split('.').pop()?.toLowerCase();
  if (mediaType === 'image') {
    if (fromUri === 'png' || fromUri === 'webp' || fromUri === 'heic') return 'jpg';
    return fromUri && fromUri.length <= 4 ? fromUri : 'jpg';
  }
  return 'mp4';
}

async function makeTargetUri(mediaType: 'image' | 'video', sourceUri: string): Promise<string> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('Brak katalogu cache do wypalenia tekstu.');
  }
  await FileSystem.makeDirectoryAsync(BAKE_CACHE_DIR, { intermediates: true });
  const ext = extensionFor(mediaType, sourceUri);
  const name = `bake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return `${BAKE_CACHE_DIR}${name}`;
}

/**
 * Bakes drawing and text in one native render pass. Drawing is composited first,
 * keeping text readable and matching the preview layer order.
 */
export async function bakeMediaOverlays(params: {
  uri: string;
  mediaType: 'image' | 'video';
  textOverlay?: MediaTextOverlayInput | null;
  drawingOverlay?: MediaDrawingOverlayInput | null;
  viewportWidth?: number;
  viewportHeight?: number;
}): Promise<BakeMediaOverlaysResult> {
  const textOverlay = normalizeMediaTextOverlay(params.textOverlay);
  const drawingOverlay = normalizeMediaDrawingOverlay(params.drawingOverlay);
  if (!textOverlay && !drawingOverlay) {
    return { uri: params.uri, didBake: false, temporaryUris: [] };
  }
  const eventPrefix = drawingOverlay ? 'media_overlay' : 'text_overlay';

  if (!isNixMediaOverlayAvailable()) {
    trackEvent(`${eventPrefix}_bake_unavailable`, { media_type: params.mediaType });
    return { uri: params.uri, didBake: false, temporaryUris: [] };
  }

  const viewport = {
    viewportWidth: params.viewportWidth ?? defaultViewport().viewportWidth,
    viewportHeight: params.viewportHeight ?? defaultViewport().viewportHeight,
  };
  const targetUri = await makeTargetUri(params.mediaType, params.uri);
  const startedAt = nowMs();
  trackEvent(`${eventPrefix}_bake_started`, {
    media_type: params.mediaType,
    has_text: Boolean(textOverlay),
    has_drawing: Boolean(drawingOverlay),
    text_length: textOverlay?.text.length ?? 0,
    y: textOverlay?.y,
    bold: textOverlay?.bold,
    italic: textOverlay?.italic,
    underline: textOverlay?.underline,
    strikethrough: textOverlay?.strikethrough,
    monospace: textOverlay?.monospace,
    font_design: textOverlay?.fontDesign,
    preset: textOverlay?.preset,
    align: textOverlay?.align,
  });

  try {
    const baked =
      params.mediaType === 'image'
        ? await bakeOverlaysOnImageAsync({
            sourceUri: params.uri,
            targetUri,
            textOverlay,
            drawingOverlay,
            ...viewport,
          })
        : await bakeOverlaysOnVideoAsync({
            sourceUri: params.uri,
            targetUri,
            textOverlay,
            drawingOverlay,
            ...viewport,
          });

    if (!baked) {
      trackEvent(`${eventPrefix}_bake_unavailable`, { media_type: params.mediaType });
      return { uri: params.uri, didBake: false, temporaryUris: [] };
    }

    trackDuration(`${eventPrefix}_bake_success_ms`, startedAt, {
      status: 'success',
      media_type: params.mediaType,
    });
    return { uri: baked, didBake: true, temporaryUris: [baked] };
  } catch (error) {
    trackEvent(`${eventPrefix}_bake_failed`, {
      media_type: params.mediaType,
      error_message: error instanceof Error ? error.message : String(error ?? 'unknown'),
    });
    try {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    } catch {
      // best-effort
    }
    throw error;
  }
}

/** Compatibility wrapper for existing text-only call sites. */
export function bakeMediaTextOverlay(params: {
  uri: string;
  mediaType: 'image' | 'video';
  overlay?: MediaTextOverlayInput | null;
  viewportWidth?: number;
  viewportHeight?: number;
}): Promise<BakeMediaTextOverlayResult> {
  return bakeMediaOverlays({
    uri: params.uri,
    mediaType: params.mediaType,
    textOverlay: params.overlay,
    viewportWidth: params.viewportWidth,
    viewportHeight: params.viewportHeight,
  });
}

export async function releaseBakedOverlayUris(uris: readonly string[]) {
  await Promise.all(
    uris.map(async (uri) => {
      try {
        if (!uri.includes('nix-text-overlay')) return;
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // ignore
      }
    })
  );
}
