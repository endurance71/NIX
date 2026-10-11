import type { ChatBubbleGroupPosition } from './chatTimeline';

export const BUBBLE_RADIUS = 18;
/** Corners facing another bubble of the same group (iMessage). */
export const BUBBLE_INNER_RADIUS = 6;
/** Vertical padding of a row at a group edge vs inside a group. */
export const BUBBLE_ROW_GAP = 3;
export const BUBBLE_ROW_GAP_GROUPED = 1;

export type ChatBubbleShape = {
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
  /** Only the last bubble of a group (or a lone bubble) points at its sender. */
  showTail: boolean;
  paddingTop: number;
  paddingBottom: number;
};

/**
 * Corners and spacing of a bubble in its group. Only the sender's side changes: own bubbles sit
 * on the right, incoming on the left; the other side keeps the full radius.
 */
export function chatBubbleShape(
  group: ChatBubbleGroupPosition | undefined,
  isOwn: boolean,
): ChatBubbleShape {
  const position = group ?? 'single';
  const joinsPrevious = position === 'middle' || position === 'last';
  const joinsNext = position === 'first' || position === 'middle';
  const senderTop = joinsPrevious ? BUBBLE_INNER_RADIUS : BUBBLE_RADIUS;
  const senderBottom = joinsNext ? BUBBLE_INNER_RADIUS : BUBBLE_RADIUS;
  return {
    borderTopLeftRadius: isOwn ? BUBBLE_RADIUS : senderTop,
    borderTopRightRadius: isOwn ? senderTop : BUBBLE_RADIUS,
    borderBottomLeftRadius: isOwn ? BUBBLE_RADIUS : senderBottom,
    borderBottomRightRadius: isOwn ? senderBottom : BUBBLE_RADIUS,
    showTail: !joinsNext,
    paddingTop: joinsPrevious ? BUBBLE_ROW_GAP_GROUPED : BUBBLE_ROW_GAP,
    paddingBottom: joinsNext ? BUBBLE_ROW_GAP_GROUPED : BUBBLE_ROW_GAP,
  };
}
