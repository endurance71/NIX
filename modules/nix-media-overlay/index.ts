import { requireNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  resolveMediaTextBarColor,
  type MediaTextOverlay,
} from '../../src/types/mediaTextOverlay';
import type { MediaDrawingOverlay } from '../../src/types/mediaDrawingOverlay';

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
};

type NixMediaOverlayNativeModule = {
  bakeOverlaysOnImageAsync(options: NativeBakeOverlaysOptions): Promise<string>;
  bakeOverlaysOnVideoAsync(options: NativeBakeOverlaysOptions): Promise<string>;
};

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
