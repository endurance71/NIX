import { Dimensions } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  bakeTextOnImageAsync,
  bakeTextOnVideoAsync,
  isNixMediaOverlayAvailable,
} from '../../modules/nix-media-overlay';
import { nowMs, trackDuration, trackEvent } from './telemetry';
import {
  normalizeMediaTextOverlay,
  type MediaTextOverlayInput,
} from '../types/mediaTextOverlay';

const BAKE_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}nix-text-overlay/`;

export type BakeMediaTextOverlayResult = {
  uri: string;
  /** True when a new temporary file was created and should be cleaned up later. */
  didBake: boolean;
  temporaryUris: string[];
};

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
 * Bakes text overlay into a local media file. Returns the original URI when
 * there is no overlay or the native module is unavailable (with telemetry).
 */
export async function bakeMediaTextOverlay(params: {
  uri: string;
  mediaType: 'image' | 'video';
  overlay?: MediaTextOverlayInput | null;
  viewportWidth?: number;
  viewportHeight?: number;
}): Promise<BakeMediaTextOverlayResult> {
  const overlay = normalizeMediaTextOverlay(params.overlay);
  if (!overlay) {
    return { uri: params.uri, didBake: false, temporaryUris: [] };
  }

  if (!isNixMediaOverlayAvailable()) {
    trackEvent('text_overlay_bake_unavailable', { media_type: params.mediaType });
    return { uri: params.uri, didBake: false, temporaryUris: [] };
  }

  const viewport = {
    viewportWidth: params.viewportWidth ?? defaultViewport().viewportWidth,
    viewportHeight: params.viewportHeight ?? defaultViewport().viewportHeight,
  };
  const targetUri = await makeTargetUri(params.mediaType, params.uri);
  const startedAt = nowMs();
  trackEvent('text_overlay_bake_started', {
    media_type: params.mediaType,
    text_length: overlay.text.length,
    y: overlay.y,
    bold: overlay.bold,
    italic: overlay.italic,
    underline: overlay.underline,
    strikethrough: overlay.strikethrough,
    monospace: overlay.monospace,
    font_design: overlay.fontDesign,
    preset: overlay.preset,
    align: overlay.align,
  });

  try {
    const baked =
      params.mediaType === 'image'
        ? await bakeTextOnImageAsync({
            sourceUri: params.uri,
            targetUri,
            overlay,
            ...viewport,
          })
        : await bakeTextOnVideoAsync({
            sourceUri: params.uri,
            targetUri,
            overlay,
            ...viewport,
          });

    if (!baked) {
      trackEvent('text_overlay_bake_unavailable', { media_type: params.mediaType });
      return { uri: params.uri, didBake: false, temporaryUris: [] };
    }

    trackDuration('text_overlay_bake_success_ms', startedAt, {
      status: 'success',
      media_type: params.mediaType,
    });
    return { uri: baked, didBake: true, temporaryUris: [baked] };
  } catch (error) {
    trackEvent('text_overlay_bake_failed', {
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
