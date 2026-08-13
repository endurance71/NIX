import { requireNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
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

type NixMediaOverlayNativeModule = {
  bakeTextOnImageAsync(
    sourcePath: string,
    targetPath: string,
    text: string,
    normalizedY: number,
    fontSizePoints: number,
    viewportWidth: number,
    viewportHeight: number,
    textColor: string,
    barColor: string,
    bold: boolean,
    italic: boolean,
    underline: boolean,
    strikethrough: boolean,
    monospace: boolean,
    fontDesign: string,
    align: string,
    drawingData: string,
    drawingWidth: number,
    drawingHeight: number
  ): Promise<string>;
  bakeTextOnVideoAsync(
    sourcePath: string,
    targetPath: string,
    text: string,
    normalizedY: number,
    fontSizePoints: number,
    viewportWidth: number,
    viewportHeight: number,
    textColor: string,
    barColor: string,
    bold: boolean,
    italic: boolean,
    underline: boolean,
    strikethrough: boolean,
    monospace: boolean,
    fontDesign: string,
    align: string,
    drawingData: string,
    drawingWidth: number,
    drawingHeight: number
  ): Promise<string>;
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
    barColor: overlay?.barColor ?? DEFAULT_MEDIA_TEXT_BAR_COLOR,
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

export async function bakeOverlaysOnImageAsync(args: BakeArgs): Promise<string | null> {
  if (!NixMediaOverlay) return null;
  await ensureParentDir(args.targetUri);
  const overlay = overlayArgs(args);
  return NixMediaOverlay.bakeTextOnImageAsync(
    args.sourceUri,
    args.targetUri,
    overlay.text,
    overlay.y,
    overlay.fontSize,
    args.viewportWidth,
    args.viewportHeight,
    overlay.style.textColor,
    overlay.style.barColor,
    overlay.style.bold,
    overlay.style.italic,
    overlay.style.underline,
    overlay.style.strikethrough,
    overlay.style.monospace,
    overlay.style.fontDesign,
    overlay.style.align,
    overlay.drawingData,
    overlay.drawingWidth,
    overlay.drawingHeight
  );
}

export async function bakeOverlaysOnVideoAsync(args: BakeArgs): Promise<string | null> {
  if (!NixMediaOverlay) return null;
  await ensureParentDir(args.targetUri);
  const overlay = overlayArgs(args);
  return NixMediaOverlay.bakeTextOnVideoAsync(
    args.sourceUri,
    args.targetUri,
    overlay.text,
    overlay.y,
    overlay.fontSize,
    args.viewportWidth,
    args.viewportHeight,
    overlay.style.textColor,
    overlay.style.barColor,
    overlay.style.bold,
    overlay.style.italic,
    overlay.style.underline,
    overlay.style.strikethrough,
    overlay.style.monospace,
    overlay.style.fontDesign,
    overlay.style.align,
    overlay.drawingData,
    overlay.drawingWidth,
    overlay.drawingHeight
  );
}
