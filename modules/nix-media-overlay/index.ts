import { requireNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import {
  DEFAULT_MEDIA_TEXT_BAR_COLOR,
  DEFAULT_MEDIA_TEXT_COLOR,
  type MediaTextOverlay,
} from '../../src/types/mediaTextOverlay';

type BakeArgs = {
  sourceUri: string;
  targetUri: string;
  overlay: MediaTextOverlay;
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
    align: string
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
    align: string
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

function styleArgs(overlay: MediaTextOverlay) {
  return {
    textColor: overlay.textColor ?? DEFAULT_MEDIA_TEXT_COLOR,
    barColor: overlay.barColor ?? DEFAULT_MEDIA_TEXT_BAR_COLOR,
    bold: overlay.bold ?? true,
    italic: overlay.italic ?? false,
    underline: overlay.underline ?? false,
    strikethrough: overlay.strikethrough ?? false,
    monospace: overlay.monospace ?? false,
    fontDesign: overlay.fontDesign ?? 'system',
    align: overlay.align ?? 'center',
  };
}

export async function bakeTextOnImageAsync(args: BakeArgs): Promise<string | null> {
  if (!NixMediaOverlay) return null;
  await ensureParentDir(args.targetUri);
  const style = styleArgs(args.overlay);
  return NixMediaOverlay.bakeTextOnImageAsync(
    args.sourceUri,
    args.targetUri,
    args.overlay.text,
    args.overlay.y,
    args.overlay.fontSize,
    args.viewportWidth,
    args.viewportHeight,
    style.textColor,
    style.barColor,
    style.bold,
    style.italic,
    style.underline,
    style.strikethrough,
    style.monospace,
    style.fontDesign,
    style.align
  );
}

export async function bakeTextOnVideoAsync(args: BakeArgs): Promise<string | null> {
  if (!NixMediaOverlay) return null;
  await ensureParentDir(args.targetUri);
  const style = styleArgs(args.overlay);
  return NixMediaOverlay.bakeTextOnVideoAsync(
    args.sourceUri,
    args.targetUri,
    args.overlay.text,
    args.overlay.y,
    args.overlay.fontSize,
    args.viewportWidth,
    args.viewportHeight,
    style.textColor,
    style.barColor,
    style.bold,
    style.italic,
    style.underline,
    style.strikethrough,
    style.monospace,
    style.fontDesign,
    style.align
  );
}
