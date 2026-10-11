import { describe, expect, it } from 'vitest';
import { hasPreviewEdits, isStickerOverTrashZone } from './previewEdits';
import type { MediaTextOverlay } from '../types/mediaTextOverlay';

describe('hasPreviewEdits', () => {
  it('is false without overlays or with an empty sticker', () => {
    expect(hasPreviewEdits(null, null)).toBe(false);
    expect(hasPreviewEdits({ text: '   ', y: 0.5, fontSize: 34 } as MediaTextOverlay, null)).toBe(
      false,
    );
    expect(hasPreviewEdits(null, { data: '', width: 10, height: 10 })).toBe(false);
  });

  it('is true for text or a drawing', () => {
    expect(hasPreviewEdits({ text: 'hej', y: 0.5, fontSize: 34 } as MediaTextOverlay, null)).toBe(
      true,
    );
    expect(hasPreviewEdits(null, { data: 'abc', width: 10, height: 10 })).toBe(true);
  });
});

describe('isStickerOverTrashZone', () => {
  it('uses the sticker centre', () => {
    expect(isStickerOverTrashZone({ stickerTopPx: 500, stickerHeightPx: 60, trashZoneTopPx: 540 })).toBe(
      false,
    );
    expect(isStickerOverTrashZone({ stickerTopPx: 510, stickerHeightPx: 60, trashZoneTopPx: 540 })).toBe(
      true,
    );
  });
});
