import { describe, expect, it } from 'vitest';
import {
  PINNED_GRID_AVATAR_SIZE,
  PINNED_GRID_COLUMN_SPACING,
  PINNED_GRID_NAME_SPACING,
  PINNED_GRID_ROW_SPACING,
  layoutPinnedGrid,
  pinnedGridAnimationKey,
  resolvePinnedGridColumns,
} from './inboxPinnedGrid';
import { MAX_CONVERSATION_PINS } from './conversationPins';

describe('resolvePinnedGridColumns', () => {
  it('uses three columns up to the largest standard text size', () => {
    for (const fontScale of [0.82, 1, 1.24, 1.35]) {
      expect(resolvePinnedGridColumns(fontScale)).toBe(3);
    }
  });

  it('uses two columns at the first accessibility sizes', () => {
    expect(resolvePinnedGridColumns(1.65)).toBe(2);
    expect(resolvePinnedGridColumns(1.94)).toBe(2);
  });

  it('falls back to ordinary rows from AX3', () => {
    expect(resolvePinnedGridColumns(2.35)).toBeNull();
    expect(resolvePinnedGridColumns(3.12)).toBeNull();
  });

  it('treats a missing scale as the default size', () => {
    expect(resolvePinnedGridColumns(Number.NaN)).toBe(3);
    expect(resolvePinnedGridColumns(0)).toBe(3);
  });
});

describe('layoutPinnedGrid', () => {
  // iPhone 16: 393 pt wide, minus the 16 pt row insets.
  const width = 361;

  it('sizes three equal cells with a full-size avatar', () => {
    const layout = layoutPinnedGrid({ count: 3, columns: 3, width, fontScale: 1 });
    expect(layout.cellWidth).toBe(Math.floor((width - 2 * PINNED_GRID_COLUMN_SPACING) / 3));
    expect(layout.avatarSize).toBe(PINNED_GRID_AVATAR_SIZE);
    expect(layout.cellHeight).toBe(PINNED_GRID_AVATAR_SIZE + PINNED_GRID_NAME_SPACING + 20);
    expect(layout.positions.map((position) => position.y)).toEqual([0, 0, 0]);
    expect(layout.height).toBe(layout.cellHeight);
  });

  it('centers one or two pins', () => {
    const one = layoutPinnedGrid({ count: 1, columns: 3, width, fontScale: 1 });
    expect(one.positions[0].x).toBe(Math.floor((width - one.cellWidth) / 2));

    const two = layoutPinnedGrid({ count: 2, columns: 3, width, fontScale: 1 });
    const pairWidth = 2 * two.cellWidth + PINNED_GRID_COLUMN_SPACING;
    const start = Math.floor((width - pairWidth) / 2);
    expect(two.positions).toEqual([
      { x: start, y: 0 },
      { x: start + two.cellWidth + PINNED_GRID_COLUMN_SPACING, y: 0 },
    ]);
  });

  it('wraps into rows of three and centers a short last row', () => {
    const layout = layoutPinnedGrid({ count: 4, columns: 3, width, fontScale: 1 });
    const rowStep = layout.cellHeight + PINNED_GRID_ROW_SPACING;
    expect(layout.positions.map((position) => position.y)).toEqual([0, 0, 0, rowStep]);
    expect(layout.positions[3].x).toBe(layout.positions[1].x);
    expect(layout.height).toBe(2 * layout.cellHeight + PINNED_GRID_ROW_SPACING);
  });

  it('fits the pin limit in three rows of three', () => {
    const layout = layoutPinnedGrid({ count: MAX_CONVERSATION_PINS, columns: 3, width, fontScale: 1 });
    expect(new Set(layout.positions.map((position) => position.y)).size).toBe(3);
    const right = layout.positions[2].x + layout.cellWidth;
    expect(right).toBeLessThanOrEqual(width);
  });

  it('gives the name more room at larger text sizes', () => {
    const regular = layoutPinnedGrid({ count: 2, columns: 2, width, fontScale: 1 });
    const large = layoutPinnedGrid({ count: 2, columns: 2, width, fontScale: 1.94 });
    expect(large.cellHeight).toBeGreaterThan(regular.cellHeight);
    expect(large.cellWidth).toBe(Math.floor((width - PINNED_GRID_COLUMN_SPACING) / 2));
  });

  it('shrinks the avatar on a narrow width instead of letting cells touch', () => {
    const layout = layoutPinnedGrid({ count: 3, columns: 3, width: 240, fontScale: 1 });
    expect(layout.avatarSize).toBeLessThan(PINNED_GRID_AVATAR_SIZE);
    expect(layout.avatarSize).toBeLessThan(layout.cellWidth);
  });

  it('has no height without pins', () => {
    expect(layoutPinnedGrid({ count: 0, columns: 3, width, fontScale: 1 })).toMatchObject({
      height: 0,
      positions: [],
    });
  });
});

describe('pinnedGridAnimationKey', () => {
  it('is stable for the same pins and changes on pin, unpin or reorder', () => {
    const key = pinnedGridAnimationKey(['a', 'b']);
    expect(pinnedGridAnimationKey(['a', 'b'])).toBe(key);
    expect(pinnedGridAnimationKey(['a', 'b', 'c'])).not.toBe(key);
    expect(pinnedGridAnimationKey(['a'])).not.toBe(key);
    expect(pinnedGridAnimationKey(['b', 'a'])).not.toBe(key);
  });

  it('is a 32-bit integer the SwiftUI animation modifier can watch', () => {
    const key = pinnedGridAnimationKey(Array.from({ length: 9 }, (_, index) => `peer-${index}-uuid`));
    expect(Number.isInteger(key)).toBe(true);
    expect(Math.abs(key)).toBeLessThan(2 ** 31 + 1);
  });
});
