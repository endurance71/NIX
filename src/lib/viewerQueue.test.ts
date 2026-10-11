import { describe, expect, it } from 'vitest';
import {
  isSameViewerMedia,
  orderViewerQueueFromSeed,
  selectViewerVideoPoster,
  toViewerQueueItem,
  viewerVideoPosterUri,
  type ViewerQueueItem,
} from './viewerQueue';

const seed: ViewerQueueItem = {
  id: 'n1',
  media_path: 'a/n1.mp4',
  view_duration_sec: 5,
  media_type: 'video',
  playback_duration_ms: 4000,
  thumbnail_b64: null,
};

describe('viewer queue media identity', () => {
  it('treats the fetched copy of the route seed as the same media', () => {
    const fetched = toViewerQueueItem({ ...seed, thumbnail_b64: 'abc' });
    expect(fetched).not.toBe(seed);
    expect(isSameViewerMedia(seed, fetched)).toBe(true);
  });

  it('restarts for a different first item or a changed media path', () => {
    expect(isSameViewerMedia(seed, { id: 'n0', media_path: 'a/n0.jpg' })).toBe(false);
    expect(isSameViewerMedia(seed, { id: 'n1', media_path: 'a/other.mp4' })).toBe(false);
    expect(isSameViewerMedia(seed, null)).toBe(false);
  });
});

describe('viewer video poster', () => {
  it('builds a data URI only for videos with an embedded thumbnail', () => {
    expect(viewerVideoPosterUri({ media_type: 'video', thumbnail_b64: 'abc' })).toBe(
      'data:image/jpeg;base64,abc',
    );
    expect(viewerVideoPosterUri({ media_type: 'video', thumbnail_b64: 'data:image/png;base64,x' })).toBe(
      'data:image/png;base64,x',
    );
    expect(viewerVideoPosterUri({ media_type: 'image', thumbnail_b64: 'abc' })).toBeNull();
    expect(viewerVideoPosterUri({ media_type: 'video', thumbnail_b64: null })).toBeNull();
  });

  it('takes the fetched queue thumbnail for a rendered seed without one', () => {
    const fetched = { ...seed, thumbnail_b64: 'abc' };
    expect(selectViewerVideoPoster(seed, fetched)).toBe('data:image/jpeg;base64,abc');
    expect(selectViewerVideoPoster(null, fetched)).toBe('data:image/jpeg;base64,abc');
  });

  it('never shows the poster of another nix', () => {
    const other = { ...seed, id: 'n2', thumbnail_b64: 'zzz' };
    expect(selectViewerVideoPoster(seed, other)).toBeNull();
  });
});

describe('orderViewerQueueFromSeed', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('starts with the tapped NiX and keeps the others in order', () => {
    expect(orderViewerQueueFromSeed(items, 'c').map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps the queue when the seed is already first, missing or unknown', () => {
    expect(orderViewerQueueFromSeed(items, 'a').map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderViewerQueueFromSeed(items, 'x').map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(orderViewerQueueFromSeed(items, undefined).map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
