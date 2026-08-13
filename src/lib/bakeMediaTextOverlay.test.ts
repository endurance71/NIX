import { beforeEach, describe, expect, it, vi } from 'vitest';

const bakeOverlaysOnImageAsync = vi.fn();
const bakeOverlaysOnVideoAsync = vi.fn();
const isNixMediaOverlayAvailable = vi.fn(() => true);

vi.mock('../../modules/nix-media-overlay', () => ({
  bakeOverlaysOnImageAsync: (...args: unknown[]) => bakeOverlaysOnImageAsync(...args),
  bakeOverlaysOnVideoAsync: (...args: unknown[]) => bakeOverlaysOnVideoAsync(...args),
  isNixMediaOverlayAvailable: () => isNixMediaOverlayAvailable(),
}));

vi.mock('./telemetry', () => ({
  nowMs: () => 1000,
  trackDuration: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
}));

describe('bakeMediaTextOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNixMediaOverlayAvailable.mockReturnValue(true);
  });

  it('returns original uri when overlay is empty', async () => {
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      textOverlay: { text: '  ', y: 0.5, fontSize: 36 },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(result).toEqual({ uri: 'file:///photo.jpg', didBake: false, temporaryUris: [] });
    expect(bakeOverlaysOnImageAsync).not.toHaveBeenCalled();
  });

  it('returns original uri when native module is unavailable', async () => {
    isNixMediaOverlayAvailable.mockReturnValue(false);
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      textOverlay: { text: 'hi', y: 0.5, fontSize: 36 },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(result.didBake).toBe(false);
    expect(result.uri).toBe('file:///photo.jpg');
  });

  it('bakes image overlay via native module with style defaults', async () => {
    bakeOverlaysOnImageAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.jpg');
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      textOverlay: { text: 'hi', y: 0.3, fontSize: 36 },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(result.didBake).toBe(true);
    expect(result.uri).toBe('file:///cache/nix-text-overlay/out.jpg');
    expect(bakeOverlaysOnImageAsync).toHaveBeenCalledOnce();
    const call = bakeOverlaysOnImageAsync.mock.calls[0][0] as {
      textOverlay: {
        textColor: string;
        barColor: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        strikethrough: boolean;
        monospace: boolean;
        fontDesign: string;
        preset: string;
        align: string;
      };
    };
    expect(call.textOverlay.textColor).toBe('#000000');
    expect(call.textOverlay.bold).toBe(true);
    expect(call.textOverlay.italic).toBe(false);
    expect(call.textOverlay.underline).toBe(false);
    expect(call.textOverlay.strikethrough).toBe(false);
    expect(call.textOverlay.monospace).toBe(false);
    expect(call.textOverlay.fontDesign).toBe('system');
    expect(call.textOverlay.preset).toBe('title');
    expect(call.textOverlay.align).toBe('center');
  });

  it('passes custom style into bake args', async () => {
    bakeOverlaysOnImageAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.jpg');
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    await bakeMediaOverlays({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      textOverlay: {
        text: 'hi',
        y: 0.3,
        fontSize: 36,
        textColor: '#FF2D55',
        barColor: '#000000E6',
        bold: false,
        italic: true,
        underline: true,
        strikethrough: true,
        monospace: true,
        fontDesign: 'rounded',
        preset: 'monospace',
        align: 'right',
      },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    const call = bakeOverlaysOnImageAsync.mock.calls[0][0] as {
      textOverlay: {
        textColor: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        strikethrough: boolean;
        monospace: boolean;
        fontDesign: string;
        preset: string;
        align: string;
      };
    };
    expect(call.textOverlay.textColor).toBe('#FF2D55');
    expect(call.textOverlay.bold).toBe(false);
    expect(call.textOverlay.italic).toBe(true);
    expect(call.textOverlay.underline).toBe(true);
    expect(call.textOverlay.strikethrough).toBe(true);
    expect(call.textOverlay.monospace).toBe(true);
    expect(call.textOverlay.fontDesign).toBe('rounded');
    expect(call.textOverlay.preset).toBe('monospace');
    expect(call.textOverlay.align).toBe('right');
  });

  it('bakes a drawing without requiring text', async () => {
    bakeOverlaysOnImageAsync.mockResolvedValue('file:///cache/nix-text-overlay/drawing.jpg');
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      drawingOverlay: { data: 'cGtEcmF3aW5n', width: 390, height: 844 },
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(result.didBake).toBe(true);
    const call = bakeOverlaysOnImageAsync.mock.calls[0][0] as {
      textOverlay: unknown;
      drawingOverlay: { data: string; width: number; height: number };
    };
    expect(call.textOverlay).toBeNull();
    expect(call.drawingOverlay).toEqual({
      data: 'cGtEcmF3aW5n',
      width: 390,
      height: 844,
    });
  });

  it('passes drawing and text through a single native bake', async () => {
    bakeOverlaysOnImageAsync.mockResolvedValue('file:///cache/nix-text-overlay/both.jpg');
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    await bakeMediaOverlays({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      textOverlay: { text: 'hi', y: 0.5, fontSize: 36 },
      drawingOverlay: { data: 'cGtEcmF3aW5n', width: 390, height: 844 },
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(bakeOverlaysOnImageAsync).toHaveBeenCalledOnce();
  });

  it('bakes video overlay via native module', async () => {
    bakeOverlaysOnVideoAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.mp4');
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({
      uri: 'file:///clip.mp4',
      mediaType: 'video',
      textOverlay: { text: 'hi', y: 0.7, fontSize: 36 },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(result.didBake).toBe(true);
    expect(bakeOverlaysOnVideoAsync).toHaveBeenCalledOnce();
  });
});
