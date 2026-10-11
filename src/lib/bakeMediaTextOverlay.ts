import * as FileSystem from 'expo-file-system/legacy';
import {
  bakeOverlaysOnImageAsync,
  bakeOverlaysOnVideoAsync,
  bakeOverlaysOnVideoForDeliveryAsync,
  isNixMediaOverlayAvailable,
  isVideoBakeCancelledError,
  type DeliveryVideoProfile,
  type VideoBakeOutput,
} from '../../modules/nix-media-overlay';
import { selectVideoCompressionProfile } from './durableUploadPolicy';
import { nowMs, trackDuration, trackEvent } from './telemetry';
import {
  normalizeMediaTextOverlay,
  type MediaTextOverlayInput,
} from '../types/mediaTextOverlay';
import {
  hasMediaDrawingStrokes,
  normalizeMediaDrawingOverlay,
  type MediaDrawingOverlayInput,
} from '../types/mediaDrawingOverlay';

const BAKE_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}nix-text-overlay/`;

export type BakeMediaTextOverlayResult = {
  uri: string;
  /** True when a new temporary file was created and should be cleaned up later. */
  didBake: boolean;
  temporaryUris: string[];
  /**
   * True when the baked video already satisfies the upload queue's passthrough rule
   * (`selectVideoCompressionProfile(...).passthrough`), so the queue can skip its transcode when
   * given `width`/`height` below. Always false for images and unbaked media.
   */
  deliveryReady: boolean;
  /** Output size of a delivery-profile video bake; null otherwise. */
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sizeBytes: number | null;
  /** Whole-file bitrate (size × 8 / duration) of a delivery-profile bake; null otherwise. */
  bitrate: number | null;
};

/**
 * `master`: legacy highest-quality export (gallery saves).
 * `delivery`: export already encoded in the upload profile (PERF-23), for sending.
 */
export type VideoBakeTarget = 'master' | 'delivery';

/** H.264 balanced upload profile — the one `prepareVideoForUpload` would otherwise encode to. */
function deliveryVideoProfile(): DeliveryVideoProfile {
  const profile = selectVideoCompressionProfile({
    sourceBitrate: null,
    sourceSizeBytes: null,
    hevcEnabled: false,
    hevcSupported: false,
  });
  return {
    maxDimension: profile.maxSize,
    videoBitrate: profile.bitrate,
    audioBitrate: profile.audioBitrate,
    maxFrameRate: 30,
  };
}

function unbakedResult(uri: string): BakeMediaTextOverlayResult {
  return {
    uri,
    didBake: false,
    temporaryUris: [],
    deliveryReady: false,
    width: null,
    height: null,
    durationMs: null,
    sizeBytes: null,
    bitrate: null,
  };
}

function bakedResult(uri: string): BakeMediaTextOverlayResult {
  return { ...unbakedResult(uri), didBake: true, temporaryUris: [uri] };
}

/** Applies the same passthrough rule as the upload queue to the actual baked file. */
function describeDeliveryBake(output: VideoBakeOutput): BakeMediaTextOverlayResult {
  const base = bakedResult(output.uri);
  if (output.profile !== 'delivery') return base;
  const { width, height, durationMs, sizeBytes } = output;
  const bitrate = sizeBytes !== null && durationMs !== null
    ? (sizeBytes * 8) / (durationMs / 1000)
    : null;
  const deliveryReady = width !== null
    && height !== null
    && bitrate !== null
    && selectVideoCompressionProfile({
      sourceBitrate: bitrate,
      sourceSizeBytes: sizeBytes,
      sourceWidth: width,
      sourceHeight: height,
      hevcEnabled: false,
      hevcSupported: false,
    }).passthrough;
  return { ...base, deliveryReady, width, height, durationMs, sizeBytes, bitrate };
}

/**
 * Hardware encoder sessions are limited; multi-segment sends bake at most this many videos
 * at once in the delivery profile.
 */
const MAX_CONCURRENT_DELIVERY_BAKES = 2;
let activeDeliveryBakes = 0;
const deliveryBakeWaiters: (() => void)[] = [];

async function withDeliveryBakeSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeDeliveryBakes >= MAX_CONCURRENT_DELIVERY_BAKES) {
    await new Promise<void>((resolve) => deliveryBakeWaiters.push(resolve));
  } else {
    activeDeliveryBakes += 1;
  }
  try {
    return await run();
  } finally {
    const next = deliveryBakeWaiters.shift();
    if (next) next();
    else activeDeliveryBakes -= 1;
  }
}

function abortError(): Error {
  return Object.assign(new Error('Video overlay bake was cancelled'), {
    name: 'AbortError',
    code: 'ERR_BAKE_CANCELLED',
  });
}

export type BakeMediaOverlaysResult = BakeMediaTextOverlayResult;

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
 * Bakes the colour filter, drawing, emoji stickers and text in one native render pass, in the
 * preview's layer order (filter on the media only; drawing, stickers, then text on top). The
 * filter and stickers travel inside `drawingOverlay`.
 */
export async function bakeMediaOverlays(params: {
  uri: string;
  mediaType: 'image' | 'video';
  textOverlay?: MediaTextOverlayInput | null;
  drawingOverlay?: MediaDrawingOverlayInput | null;
  viewportWidth: number;
  viewportHeight: number;
  /** Video only. Defaults to `master` (unchanged legacy export). */
  videoTarget?: VideoBakeTarget;
  /** Video `delivery` bakes only: 0–1 encode progress. */
  onProgress?: (progress: number) => void;
  /** Video `delivery` bakes only: aborts the native export (rejects with `AbortError`). */
  signal?: AbortSignal;
}): Promise<BakeMediaOverlaysResult> {
  const textOverlay = normalizeMediaTextOverlay(params.textOverlay);
  const drawingOverlay = normalizeMediaDrawingOverlay(params.drawingOverlay);
  if (!textOverlay && !drawingOverlay) {
    return unbakedResult(params.uri);
  }
  const eventPrefix = drawingOverlay ? 'media_overlay' : 'text_overlay';

  if (!isNixMediaOverlayAvailable()) {
    trackEvent(`${eventPrefix}_bake_unavailable`, { media_type: params.mediaType });
    return unbakedResult(params.uri);
  }
  const deliveryVideo = params.mediaType === 'video' && params.videoTarget === 'delivery';
  if (deliveryVideo && params.signal?.aborted) throw abortError();

  const viewport = {
    viewportWidth: params.viewportWidth,
    viewportHeight: params.viewportHeight,
  };
  const targetUri = await makeTargetUri(params.mediaType, params.uri);
  const startedAt = nowMs();
  trackEvent(`${eventPrefix}_bake_started`, {
    media_type: params.mediaType,
    has_text: Boolean(textOverlay),
    has_drawing: hasMediaDrawingStrokes(drawingOverlay),
    filter: drawingOverlay?.filter,
    sticker_count: drawingOverlay?.stickers?.length ?? 0,
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
    video_target: params.mediaType === 'video' ? (params.videoTarget ?? 'master') : undefined,
  });

  const bakeArgs = {
    sourceUri: params.uri,
    targetUri,
    textOverlay,
    drawingOverlay,
    ...viewport,
  };

  try {
    let result: BakeMediaOverlaysResult;
    let output: VideoBakeOutput | null = null;
    if (deliveryVideo) {
      output = await withDeliveryBakeSlot(() => {
        if (params.signal?.aborted) throw abortError();
        return bakeOverlaysOnVideoForDeliveryAsync({
          ...bakeArgs,
          bakeId: targetUri,
          profile: deliveryVideoProfile(),
          onProgress: params.onProgress,
          signal: params.signal,
        });
      });
      if (output && params.signal?.aborted) throw abortError();
      result = output ? describeDeliveryBake(output) : unbakedResult(params.uri);
    } else {
      const baked = params.mediaType === 'image'
        ? await bakeOverlaysOnImageAsync(bakeArgs)
        : await bakeOverlaysOnVideoAsync(bakeArgs);
      result = baked ? bakedResult(baked) : unbakedResult(params.uri);
    }

    if (!result.didBake) {
      trackEvent(`${eventPrefix}_bake_unavailable`, { media_type: params.mediaType });
      return result;
    }

    trackDuration(`${eventPrefix}_bake_success_ms`, startedAt, {
      status: 'success',
      media_type: params.mediaType,
      ...(output
        ? {
            video_target: 'delivery',
            output_profile: output.profile,
            delivery_ready: result.deliveryReady,
            output_bytes: result.sizeBytes ?? undefined,
            output_bitrate: result.bitrate !== null ? Math.round(result.bitrate) : undefined,
            output_max_side: result.width !== null && result.height !== null
              ? Math.max(result.width, result.height)
              : undefined,
            fallback_reason: output.fallbackReason ?? undefined,
          }
        : {}),
    });
    return result;
  } catch (error) {
    const cancelled = isVideoBakeCancelledError(error)
      || (error instanceof Error && error.name === 'AbortError');
    if (cancelled) {
      trackEvent(`${eventPrefix}_bake_cancelled`, { media_type: params.mediaType });
    } else {
      trackEvent(`${eventPrefix}_bake_failed`, {
        media_type: params.mediaType,
        error_message: error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
    }
    try {
      await FileSystem.deleteAsync(targetUri, { idempotent: true });
    } catch {
      // best-effort
    }
    throw cancelled ? abortError() : error;
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
