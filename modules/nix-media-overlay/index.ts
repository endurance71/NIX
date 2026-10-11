import { NativeModule, requireNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  resolveMediaTextBarColor,
  type MediaTextOverlay,
} from '../../src/types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../../src/types/mediaDrawingOverlay';
import { nativeFilterMatrix } from '../../src/lib/mediaFilters';
import { toNativeStickers, type NativeEmojiSticker } from '../../src/lib/previewStickers';

type BakeArgs = {
  sourceUri: string;
  targetUri: string;
  textOverlay: MediaTextOverlay | null;
  drawingOverlay: MediaDrawingOverlay | null;
  viewportWidth: number;
  viewportHeight: number;
};

type NativeBakeOverlaysOptions = {
  sourcePath: string;
  targetPath: string;
  text: string;
  normalizedY: number;
  fontSizePoints: number;
  viewportWidth: number;
  viewportHeight: number;
  textColor: string;
  barColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  monospace: boolean;
  fontDesign: string;
  align: string;
  drawingData: string;
  drawingWidth: number;
  drawingHeight: number;
  /** 4×5 colour matrix (20 numbers); empty = no filter. Ignored by feature level < 2. */
  filterMatrix: number[];
  /** Emoji stickers, bottom to top. Ignored by feature level < 2. */
  stickers: NativeEmojiSticker[];
};

/** Upload delivery profile the native video bake encodes into (PERF-23). */
export type DeliveryVideoProfile = {
  /** Longest output side in pixels (never upscales). */
  maxDimension: number;
  /** Average H.264 video bitrate, bits per second. */
  videoBitrate: number;
  /** AAC audio bitrate, bits per second. */
  audioBitrate: number;
  /** Output frame-rate cap. */
  maxFrameRate: number;
};

type NativeDeliveryBakeOptions = NativeBakeOverlaysOptions & DeliveryVideoProfile & {
  bakeId: string;
};

type NativeDeliveryBakeResult = {
  uri: string;
  profile: 'delivery' | 'master';
  codec?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  sizeBytes?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  hasAudio?: boolean;
  frameRate?: number;
  fallbackReason?: string;
};

type NixMediaOverlayEvents = {
  onVideoBakeProgress: (event: { bakeId: string; progress: number }) => void;
};

declare class NixMediaOverlayNativeModule extends NativeModule<NixMediaOverlayEvents> {
  /**
   * 2 = colour filters, emoji stickers, filtered preview view and player filter.
   * Missing on older binaries (treated as 1), where those layers would not be baked.
   */
  featureLevel?: number;
  bakeOverlaysOnImageAsync(options: NativeBakeOverlaysOptions): Promise<string>;
  bakeOverlaysOnVideoAsync(options: NativeBakeOverlaysOptions): Promise<string>;
  /** Missing on binaries built before PERF-23 (JS may arrive by OTA first). */
  bakeOverlaysOnVideoForDeliveryAsync?(options: NativeDeliveryBakeOptions): Promise<NativeDeliveryBakeResult>;
  cancelVideoBakeAsync?(bakeId: string): Promise<void>;
  /** Feature level 2: applies a colour matrix to an expo-video player's current item. */
  applyPlayerFilterAsync?(player: unknown, filterMatrix: number[]): Promise<boolean>;
}

let NixMediaOverlay: NixMediaOverlayNativeModule | null = null;

try {
  NixMediaOverlay = requireNativeModule<NixMediaOverlayNativeModule>('NixMediaOverlay');
} catch (error) {
  console.warn(
    '[NixMediaOverlay] Native module not found. Text overlays will not bake until the app is natively rebuilt.',
    error
  );
}

export function isNixMediaOverlayAvailable(): boolean {
  return NixMediaOverlay != null;
}

/**
 * True when the installed binary bakes colour filters and emoji stickers and can preview them.
 * The editor hides both tools otherwise, so an OTA bundle never shows something the native
 * bake would silently drop.
 */
export function supportsMediaFiltersAndStickers(): boolean {
  const level = NixMediaOverlay?.featureLevel;
  return typeof level === 'number' && level >= 2;
}

/**
 * Applies a colour filter to an expo-video player (live preview). `filterMatrix` empty removes
 * it. Resolves false when unsupported or when the player has no item yet.
 */
export async function applyVideoPlayerFilterAsync(
  player: unknown,
  filterMatrix: number[]
): Promise<boolean> {
  const native = NixMediaOverlay;
  if (!native || !supportsMediaFiltersAndStickers()) return false;
  if (typeof native.applyPlayerFilterAsync !== 'function') return false;
  return native.applyPlayerFilterAsync(player, filterMatrix);
}

async function ensureParentDir(targetUri: string) {
  const dir = targetUri.substring(0, targetUri.lastIndexOf('/'));
  if (dir) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

function styleArgs(overlay: MediaTextOverlay | null) {
  return {
    textColor: overlay?.textColor ?? DEFAULT_MEDIA_TEXT_COLOR,
    barColor: resolveMediaTextBarColor(overlay?.barColor ?? DEFAULT_MEDIA_TEXT_BAR_COLOR),
    bold: overlay?.bold ?? true,
    italic: overlay?.italic ?? false,
    underline: overlay?.underline ?? false,
    strikethrough: overlay?.strikethrough ?? false,
    monospace: overlay?.monospace ?? false,
    fontDesign: overlay?.fontDesign ?? 'system',
    align: overlay?.align ?? 'center',
  };
}

function overlayArgs(args: BakeArgs) {
  const text = args.textOverlay;
  const drawing = args.drawingOverlay;
  return {
    text: text?.text ?? '',
    y: text?.y ?? 0.5,
    fontSize: text?.fontSize ?? 34,
    style: styleArgs(text),
    drawingData: drawing?.data ?? '',
    drawingWidth: drawing?.width ?? 0,
    drawingHeight: drawing?.height ?? 0,
    filterMatrix: nativeFilterMatrix(drawing?.filter),
    stickers: toNativeStickers(drawing?.stickers),
  };
}

function nativeBakeOptions(args: BakeArgs): NativeBakeOverlaysOptions {
  const overlay = overlayArgs(args);
  return {
    sourcePath: args.sourceUri,
    targetPath: args.targetUri,
    text: overlay.text,
    normalizedY: overlay.y,
    fontSizePoints: overlay.fontSize,
    viewportWidth: args.viewportWidth,
    viewportHeight: args.viewportHeight,
    textColor: overlay.style.textColor,
    barColor: overlay.style.barColor,
    bold: overlay.style.bold,
    italic: overlay.style.italic,
    underline: overlay.style.underline,
    strikethrough: overlay.style.strikethrough,
    monospace: overlay.style.monospace,
    fontDesign: overlay.style.fontDesign,
    align: overlay.style.align,
    drawingData: overlay.drawingData,
    drawingWidth: overlay.drawingWidth,
    drawingHeight: overlay.drawingHeight,
    filterMatrix: overlay.filterMatrix,
    stickers: overlay.stickers,
  };
}

export async function bakeOverlaysOnImageAsync(args: BakeArgs): Promise<string | null> {
  if (!NixMediaOverlay) return null;
  await ensureParentDir(args.targetUri);
  return NixMediaOverlay.bakeOverlaysOnImageAsync(nativeBakeOptions(args));
}

export async function bakeOverlaysOnVideoAsync(args: BakeArgs): Promise<string | null> {
  if (!NixMediaOverlay) return null;
  await ensureParentDir(args.targetUri);
  return NixMediaOverlay.bakeOverlaysOnVideoAsync(nativeBakeOptions(args));
}

/** Result of a delivery-profile video bake. `profile: 'master'` means the legacy export ran. */
export type VideoBakeOutput = {
  uri: string;
  profile: 'delivery' | 'master';
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sizeBytes: number | null;
  hasAudio: boolean | null;
  /** Why the delivery export was not used (`native_unsupported` on older binaries). */
  fallbackReason: string | null;
};

const VIDEO_BAKE_CANCELLED_CODE = 'ERR_BAKE_CANCELLED';

export function isVideoBakeCancelledError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === VIDEO_BAKE_CANCELLED_CODE;
}

function videoBakeCancelledError(): Error {
  return Object.assign(new Error('Video overlay bake was cancelled'), {
    code: VIDEO_BAKE_CANCELLED_CODE,
  });
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Bakes overlays into a video encoded directly in the upload delivery profile, so the upload
 * queue can skip its own transcode. Falls back to the legacy high-quality bake on binaries that
 * predate the native function (result `profile: 'master'`).
 */
export async function bakeOverlaysOnVideoForDeliveryAsync(
  args: BakeArgs & {
    bakeId: string;
    profile: DeliveryVideoProfile;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }
): Promise<VideoBakeOutput | null> {
  const native = NixMediaOverlay;
  if (!native) return null;
  if (args.signal?.aborted) throw videoBakeCancelledError();
  await ensureParentDir(args.targetUri);

  if (typeof native.bakeOverlaysOnVideoForDeliveryAsync !== 'function') {
    const uri = await native.bakeOverlaysOnVideoAsync(nativeBakeOptions(args));
    return {
      uri,
      profile: 'master',
      width: null,
      height: null,
      durationMs: null,
      sizeBytes: null,
      hasAudio: null,
      fallbackReason: 'native_unsupported',
    };
  }

  const { onProgress, signal, bakeId } = args;
  const subscription = onProgress
    ? native.addListener('onVideoBakeProgress', (event) => {
        if (event.bakeId === bakeId) onProgress(event.progress);
      })
    : null;
  const onAbort = () => {
    void native.cancelVideoBakeAsync?.(bakeId).catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const raw = await native.bakeOverlaysOnVideoForDeliveryAsync({
      ...nativeBakeOptions(args),
      ...args.profile,
      bakeId,
    });
    return {
      uri: raw.uri,
      profile: raw.profile === 'delivery' ? 'delivery' : 'master',
      width: finiteOrNull(raw.width),
      height: finiteOrNull(raw.height),
      durationMs: finiteOrNull(raw.durationMs),
      sizeBytes: finiteOrNull(raw.sizeBytes),
      hasAudio: typeof raw.hasAudio === 'boolean' ? raw.hasAudio : null,
      fallbackReason: raw.fallbackReason ?? null,
    };
  } finally {
    subscription?.remove();
    signal?.removeEventListener('abort', onAbort);
  }
}
