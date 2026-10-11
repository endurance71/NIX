/**
 * Pinned conversations as an avatar grid at the top of the inbox, like Messages — pure layout
 * rules (columns per Dynamic Type size, cell positions, animation key), tested without SwiftUI.
 */

/** Avatar diameter in a grid cell (Messages draws pins at roughly 88–96 pt). */
export const PINNED_GRID_AVATAR_SIZE = 88;
export const PINNED_GRID_COLUMN_SPACING = 12;
export const PINNED_GRID_ROW_SPACING = 14;
/** Gap between the avatar and the name under it. */
export const PINNED_GRID_NAME_SPACING = 6;
/** Footnote line height at the default (Large) text size. */
const PINNED_GRID_NAME_LINE_HEIGHT = 18;
/**
 * Footnote grows a little faster than body (RN's `fontScale`) at the accessibility sizes, e.g.
 * AX2: 27/13 ≈ 2.08 vs 33/17 ≈ 1.94; the margin keeps the one-line name from being clipped.
 */
const PINNED_GRID_NAME_SCALE_MARGIN = 1.1;

/** From the first accessibility text size (AX1 ≈ 1.65) the grid has two columns. */
const PINNED_GRID_TWO_COLUMNS_FONT_SCALE = 1.5;
/** From AX3 (≈ 2.35) names no longer fit under an avatar: pins go back to ordinary rows. */
const PINNED_GRID_ROWS_FALLBACK_FONT_SCALE = 2.2;

/**
 * Columns of the pinned grid for the current Dynamic Type scale, or `null` when pinned
 * conversations should be shown as ordinary (pinned-first) rows instead.
 */
export function resolvePinnedGridColumns(fontScale: number): 3 | 2 | null {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  if (scale >= PINNED_GRID_ROWS_FALLBACK_FONT_SCALE) return null;
  return scale >= PINNED_GRID_TWO_COLUMNS_FONT_SCALE ? 2 : 3;
}

export type PinnedGridLayout = {
  columns: number;
  cellWidth: number;
  cellHeight: number;
  avatarSize: number;
  /** Total height of the grid. */
  height: number;
  /** Top-left corner of each cell, in pin order. */
  positions: { x: number; y: number }[];
};

/**
 * Cell frames for `count` pins in rows of `columns`. Every row is centered, so one or two pins (or
 * a short last row) sit in the middle like in Messages. Cells are absolutely positioned so a pin
 * keeps its identity when the grid reflows (pin / unpin glides instead of re-creating cells).
 */
export function layoutPinnedGrid({
  count,
  columns,
  width,
  fontScale,
}: {
  count: number;
  columns: number;
  /** Width available to the grid (the list row minus its insets). */
  width: number;
  fontScale: number;
}): PinnedGridLayout {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeWidth = Math.max(0, width);
  const cellWidth = Math.max(
    0,
    Math.floor((safeWidth - (safeColumns - 1) * PINNED_GRID_COLUMN_SPACING) / safeColumns),
  );
  // A narrow screen shrinks the avatar rather than letting neighbours touch.
  const avatarSize = Math.max(0, Math.min(PINNED_GRID_AVATAR_SIZE, cellWidth - 8));
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const nameHeight = Math.ceil(PINNED_GRID_NAME_LINE_HEIGHT * scale * PINNED_GRID_NAME_SCALE_MARGIN);
  const cellHeight = avatarSize + PINNED_GRID_NAME_SPACING + nameHeight;
  const total = Math.max(0, Math.floor(count));
  const rowCount = Math.ceil(total / safeColumns);

  const positions: { x: number; y: number }[] = [];
  for (let index = 0; index < total; index += 1) {
    const row = Math.floor(index / safeColumns);
    const column = index % safeColumns;
    const inRow = Math.min(safeColumns, total - row * safeColumns);
    const rowWidth = inRow * cellWidth + (inRow - 1) * PINNED_GRID_COLUMN_SPACING;
    const startX = Math.max(0, Math.floor((safeWidth - rowWidth) / 2));
    positions.push({
      x: startX + column * (cellWidth + PINNED_GRID_COLUMN_SPACING),
      y: row * (cellHeight + PINNED_GRID_ROW_SPACING),
    });
  }

  return {
    columns: safeColumns,
    cellWidth,
    cellHeight,
    avatarSize,
    height: rowCount === 0 ? 0 : rowCount * cellHeight + (rowCount - 1) * PINNED_GRID_ROW_SPACING,
    positions,
  };
}

/**
 * A number that changes whenever the pinned set or its order changes — the value the SwiftUI
 * `animation` modifier watches, so a pin / unpin animates and nothing else (unread, avatar URL) does.
 */
export function pinnedGridAnimationKey(peerIds: readonly string[]): number {
  // djb2 over the ordered ids; collisions only cost one missed animation.
  let hash = 5381;
  const text = peerIds.join('|');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return hash;
}
