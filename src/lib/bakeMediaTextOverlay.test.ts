import { beforeEach, describe, expect, it, vi } from 'vitest';

const bakeOverlaysOnImageAsync = vi.fn();
const bakeOverlaysOnVideoAsync = vi.fn();
const bakeOverlaysOnVideoForDeliveryAsync = vi.fn();
const isNixMediaOverlayAvailable = vi.fn(() => true);
const trackEvent = vi.fn();
const trackDuration = vi.fn();
const deleteAsync = vi.fn(async (_uri: string, _options?: unknown) => undefined);

vi.mock('../../modules/nix-media-overlay', () => ({
  bakeOverlaysOnImageAsync: (...args: unknown[]) => bakeOverlaysOnImageAsync(...args),
  bakeOverlaysOnVideoAsync: (...args: unknown[]) => bakeOverlaysOnVideoAsync(...args),
  bakeOverlaysOnVideoForDeliveryAsync: (...args: unknown[]) =>
    bakeOverlaysOnVideoForDeliveryAsync(...args),
  isNixMediaOverlayAvailable: () => isNixMediaOverlayAvailable(),
  isVideoBakeCancelledError: (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ERR_BAKE_CANCELLED',
}));

vi.mock('./telemetry', () => ({
  nowMs: () => 1000,
  trackDuration: (...args: unknown[]) => trackDuration(...args),
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: vi.fn(async () => undefined),
  deleteAsync: (uri: string, options?: unknown) => deleteAsync(uri, options),
}));

/** Native delivery result for a 10 s clip at the given whole-file bitrate. */
function deliveryOutput(overrides: Record<string, unknown> = {}, bitrate = 1_900_000) {
  return {
    uri: 'file:///cache/nix-text-overlay/out.mp4',
    profile: 'delivery',
    width: 720,
    height: 1280,
    durationMs: 10_000,
    sizeBytes: (bitrate * 10) / 8,
    hasAudio: true,
    fallbackReason: null,
    ...overrides,
  };
}

const videoParams = {
  uri: 'file:///clip.mp4',
  mediaType: 'video' as const,
  textOverlay: { text: 'hi', y: 0.7, fontSize: 36 },
  viewportWidth: 390,
  viewportHeight: 844,
};

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
    expect(result).toEqual({
      uri: 'file:///photo.jpg',
      didBake: false,
      temporaryUris: [],
      deliveryReady: false,
      width: null,
      height: null,
      durationMs: null,
      sizeBytes: null,
      bitrate: null,
    });
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

  it('keeps the legacy master export for video by default', async () => {
    bakeOverlaysOnVideoAsync.mockResolvedValue('file:///cache/nix-text-overlay/out.mp4');
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays(videoParams);
    expect(bakeOverlaysOnVideoForDeliveryAsync).not.toHaveBeenCalled();
    expect(result.deliveryReady).toBe(false);
    expect(result.temporaryUris).toEqual(['file:///cache/nix-text-overlay/out.mp4']);
  });

  it('bakes video straight into the upload delivery profile', async () => {
    bakeOverlaysOnVideoForDeliveryAsync.mockResolvedValue(deliveryOutput());
    const onProgress = vi.fn();
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({ ...videoParams, videoTarget: 'delivery', onProgress });

    expect(bakeOverlaysOnVideoAsync).not.toHaveBeenCalled();
    const call = bakeOverlaysOnVideoForDeliveryAsync.mock.calls[0][0] as {
      bakeId: string;
      targetUri: string;
      profile: Record<string, number>;
      onProgress: unknown;
    };
    expect(call.profile).toEqual({
      maxDimension: 1280,
      videoBitrate: 1_800_000,
      audioBitrate: 96_000,
      maxFrameRate: 30,
    });
    expect(call.bakeId).toBe(call.targetUri);
    expect(call.onProgress).toBe(onProgress);
    expect(result).toMatchObject({
      uri: 'file:///cache/nix-text-overlay/out.mp4',
      didBake: true,
      deliveryReady: true,
      width: 720,
      height: 1280,
      durationMs: 10_000,
      bitrate: 1_900_000,
    });
  });

  it('is not delivery ready when the encoder overshoots the passthrough tolerance', async () => {
    bakeOverlaysOnVideoForDeliveryAsync.mockResolvedValue(deliveryOutput({}, 2_300_000));
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({ ...videoParams, videoTarget: 'delivery' });
    expect(result.didBake).toBe(true);
    expect(result.deliveryReady).toBe(false);
  });

  it('is not delivery ready when native fell back to the master export', async () => {
    bakeOverlaysOnVideoForDeliveryAsync.mockResolvedValue({
      uri: 'file:///cache/nix-text-overlay/out.mp4',
      profile: 'master',
      width: null,
      height: null,
      durationMs: null,
      sizeBytes: null,
      hasAudio: null,
      fallbackReason: 'native_unsupported',
    });
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const result = await bakeMediaOverlays({ ...videoParams, videoTarget: 'delivery' });
    expect(result.didBake).toBe(true);
    expect(result.deliveryReady).toBe(false);
    expect(result.width).toBeNull();
  });

  it('does not start a delivery bake when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    await expect(
      bakeMediaOverlays({ ...videoParams, videoTarget: 'delivery', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(bakeOverlaysOnVideoForDeliveryAsync).not.toHaveBeenCalled();
  });

  it('maps a native cancellation to AbortError and removes the partial file', async () => {
    bakeOverlaysOnVideoForDeliveryAsync.mockRejectedValue(
      Object.assign(new Error('cancelled'), { code: 'ERR_BAKE_CANCELLED' }),
    );
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    await expect(
      bakeMediaOverlays({ ...videoParams, videoTarget: 'delivery' }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(trackEvent).toHaveBeenCalledWith('text_overlay_bake_cancelled', { media_type: 'video' });
    expect(trackEvent).not.toHaveBeenCalledWith('text_overlay_bake_failed', expect.anything());
    expect(deleteAsync).toHaveBeenCalledWith(
      expect.stringContaining('nix-text-overlay/bake-'),
      { idempotent: true },
    );
  });

  it('runs at most two delivery bakes at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: (() => void)[] = [];
    bakeOverlaysOnVideoForDeliveryAsync.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => releases.push(resolve));
      inFlight -= 1;
      return deliveryOutput();
    });
    const { bakeMediaOverlays } = await import('./bakeMediaTextOverlay');
    const bakes = [1, 2, 3].map(() => bakeMediaOverlays({ ...videoParams, videoTarget: 'delivery' }));
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(0));
    const results = await Promise.all(bakes);
    expect(results.every((result) => result.deliveryReady)).toBe(true);
    expect(bakeOverlaysOnVideoForDeliveryAsync).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(2);
  });
});
