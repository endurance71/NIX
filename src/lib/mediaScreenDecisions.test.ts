import { describe, expect, it, vi } from 'vitest';
import { normalizeViewerScreenParams } from './viewerScreenParams';
import { selectOwnedViewerMedia } from './viewerOwnedMedia';
import {
  decodeParamUri,
  paramFirst,
  resolvePreviewVideoSegments,
  routeVideoSegment,
} from './previewRoute';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock('./i18n', () => ({ default: { t: (key: string) => key } }));

describe('viewer and preview parameters', () => {
  it('takes the first parameter and retains replay, video and duration semantics', () => {
    expect(
      normalizeViewerScreenParams({
        id: ['first', 'second'],
        path: 'media',
        mediaType: 'video',
        playbackDurationMs: '1234',
        thumbnailB64: 'thumb',
        isReplay: '1',
        viewDurationSec: '0',
      }),
    ).toMatchObject({
      paramId: 'first',
      paramMediaType: 'video',
      paramPlaybackDurationMs: 1234,
      paramIsReplay: true,
      paramViewDurationSec: 0,
      paramThumbnailB64: 'thumb',
    });
    for (const value of [undefined, '', 'abc', 'Infinity', '-1', '0']) {
      expect(
        normalizeViewerScreenParams({ playbackDurationMs: value }).paramPlaybackDurationMs,
      ).toBeNull();
    }
    expect(normalizeViewerScreenParams({ mediaType: 'unknown', thumbnailB64: '' })).toMatchObject({
      paramMediaType: 'image',
      paramThumbnailB64: null,
      paramIsReplay: false,
    });
  });
  it('hides stale media immediately when an account changes or signs out', () => {
    const media = {
      renderOwnerId: 'old',
      renderNix: { id: 'private' },
      imageUrl: 'file://private',
      imageReady: true,
    };
    expect(selectOwnedViewerMedia(media, 'old').renderNix).toBe(media.renderNix);
    for (const owner of ['new', undefined]) {
      expect(selectOwnedViewerMedia(media, owner)).toEqual({
        renderNix: null,
        imageUrl: null,
        imageReady: false,
      });
    }
  });
  it('preserves malformed URI fallbacks and uses video drafts before route fallbacks', () => {
    expect(paramFirst(['first', 'second'])).toBe('first');
    expect(decodeParamUri('file%3A%2F%2Fa')).toBe('file://a');
    expect(decodeParamUri('%bad%uri')).toBe('%bad%uri');
    const draft = [{ uri: 'draft', durationMs: 1200 }];
    expect(resolvePreviewVideoSegments(draft, 'video', 'route', '50')).toBe(draft);
    expect(resolvePreviewVideoSegments([], 'video', 'route', '50.7')).toEqual([
      { uri: 'route', durationMs: 51 },
    ]);
    expect(routeVideoSegment('video', 'route', '-10')).toEqual({ uri: 'route', durationMs: 0 });
    expect(routeVideoSegment('image', 'route', '100')).toBeNull();
    expect(resolvePreviewVideoSegments(null, 'video', undefined, '100')).toBeNull();
  });
});
