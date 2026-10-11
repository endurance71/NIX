import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultMediaTextOverlay } from '../types/mediaTextOverlay';

const bakeOverlaysOnImageAsync = vi.fn(async (_options: Record<string, unknown>) => 'file:///out.jpg');
let nativeModule: Record<string, unknown> = {};

vi.mock('expo', () => ({
  NativeModule: class {},
  requireNativeModule: () => nativeModule,
}));

vi.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: vi.fn(async () => undefined),
}));

async function loadModule(native: Record<string, unknown>) {
  nativeModule = { bakeOverlaysOnImageAsync, ...native };
  vi.resetModules();
  return import('../../modules/nix-media-overlay');
}

const stickerFormat = {
  fontSize: 48,
  textColor: '#FF2D55',
  bold: true,
  italic: true,
  align: 'left' as const,
};

async function bakeOptions(
  native: Record<string, unknown>,
  variant: 'bar' | 'sticker'
): Promise<Record<string, unknown>> {
  const overlayModule = await loadModule(native);
  await overlayModule.bakeOverlaysOnImageAsync({
    sourceUri: 'file:///in.jpg',
    targetUri: 'file:///cache/out.jpg',
    textOverlay: { ...createDefaultMediaTextOverlay('hej', variant), ...stickerFormat },
    drawingOverlay: null,
    viewportWidth: 390,
    viewportHeight: 844,
  });
  return bakeOverlaysOnImageAsync.mock.calls[0][0];
}

describe('nix-media-overlay caption bar gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the bar only when the binary exposes supportsCaptionBar', async () => {
    expect((await loadModule({ supportsCaptionBar: true })).supportsMediaTextCaptionBar()).toBe(true);
    // Build 12 and older: the constant is missing.
    expect((await loadModule({ featureLevel: 2 })).supportsMediaTextCaptionBar()).toBe(false);
    expect((await loadModule({ supportsCaptionBar: false })).supportsMediaTextCaptionBar()).toBe(false);
  });

  it('sends the bar variant with its fixed look instead of the stored sticker format', async () => {
    const options = await bakeOptions({ supportsCaptionBar: true }, 'bar');
    expect(options).toMatchObject({
      variant: 'bar',
      fontSizePoints: 17,
      textColor: '#FFFFFF',
      barColor: '#00000099',
      bold: false,
      italic: false,
      fontDesign: 'system',
      align: 'center',
    });
  });

  it('bakes a bar as the formatted sticker on a binary without the bar', async () => {
    const options = await bakeOptions({ featureLevel: 2 }, 'bar');
    expect(options).toMatchObject({
      variant: 'sticker',
      fontSizePoints: 48,
      textColor: '#FF2D55',
      bold: true,
      italic: true,
      align: 'left',
    });
  });

  it('leaves the sticker unchanged', async () => {
    const options = await bakeOptions({ supportsCaptionBar: true }, 'sticker');
    expect(options).toMatchObject({
      variant: 'sticker',
      fontSizePoints: 48,
      textColor: '#FF2D55',
      italic: true,
      align: 'left',
    });
  });
});
