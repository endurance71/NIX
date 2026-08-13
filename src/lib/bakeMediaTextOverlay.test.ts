import { beforeEach, describe, expect, it, vi } from 'vitest';

const bakeTextOnImageAsync = vi.fn();
const bakeTextOnVideoAsync = vi.fn();
const isNixMediaOverlayAvailable = vi.fn(() => true);

vi.mock('../../modules/nix-media-overlay', () => ({
  bakeTextOnImageAsync: (...args: unknown[]) => bakeTextOnImageAsync(...args),
  bakeTextOnVideoAsync: (...args: unknown[]) => bakeTextOnVideoAsync(...args),
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

vi.mock('react-native', () => ({
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
  },
}));

describe('bakeMediaTextOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNixMediaOverlayAvailable.mockReturnValue(true);
  });

  it('returns original uri when overlay is empty', async () => {
    const { bakeMediaTextOverlay } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaTextOverlay({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      overlay: { text: '  ', y: 0.5, fontSize: 36 },
    });
    expect(result).toEqual({ uri: 'file:///photo.jpg', didBake: false, temporaryUris: [] });
    expect(bakeTextOnImageAsync).not.toHaveBeenCalled();
  });

  it('returns original uri when native module is unavailable', async () => {
    isNixMediaOverlayAvailable.mockReturnValue(false);
    const { bakeMediaTextOverlay } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaTextOverlay({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      overlay: { text: 'hi', y: 0.5, fontSize: 36 },
    });
    expect(result.didBake).toBe(false);
    expect(result.uri).toBe('file:///photo.jpg');
  });

  it('bakes image overlay via native module with style defaults', async () => {
    bakeTextOnImageAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.jpg');
    const { bakeMediaTextOverlay } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaTextOverlay({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      overlay: { text: 'hi', y: 0.3, fontSize: 36 },
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(result.didBake).toBe(true);
    expect(result.uri).toBe('file:///cache/nix-text-overlay/out.jpg');
    expect(bakeTextOnImageAsync).toHaveBeenCalledOnce();
    const call = bakeTextOnImageAsync.mock.calls[0][0] as {
      overlay: {
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
    expect(call.overlay.textColor).toBe('#000000');
    expect(call.overlay.bold).toBe(true);
    expect(call.overlay.italic).toBe(false);
    expect(call.overlay.underline).toBe(false);
    expect(call.overlay.strikethrough).toBe(false);
    expect(call.overlay.monospace).toBe(false);
    expect(call.overlay.fontDesign).toBe('system');
    expect(call.overlay.preset).toBe('title');
    expect(call.overlay.align).toBe('center');
  });

  it('passes custom style into bake args', async () => {
    bakeTextOnImageAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.jpg');
    const { bakeMediaTextOverlay } = await import('./bakeMediaTextOverlay');
    await bakeMediaTextOverlay({
      uri: 'file:///photo.jpg',
      mediaType: 'image',
      overlay: {
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
    });
    const call = bakeTextOnImageAsync.mock.calls[0][0] as {
      overlay: {
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
    expect(call.overlay.textColor).toBe('#FF2D55');
    expect(call.overlay.bold).toBe(false);
    expect(call.overlay.italic).toBe(true);
    expect(call.overlay.underline).toBe(true);
    expect(call.overlay.strikethrough).toBe(true);
    expect(call.overlay.monospace).toBe(true);
    expect(call.overlay.fontDesign).toBe('rounded');
    expect(call.overlay.preset).toBe('monospace');
    expect(call.overlay.align).toBe('right');
  });

  it('bakes video overlay via native module', async () => {
    bakeTextOnVideoAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.mp4');
    const { bakeMediaTextOverlay } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaTextOverlay({
      uri: 'file:///clip.mp4',
      mediaType: 'video',
      overlay: { text: 'hi', y: 0.7, fontSize: 36 },
    });
    expect(result.didBake).toBe(true);
    expect(bakeTextOnVideoAsync).toHaveBeenCalledOnce();
  });
});
