/**
 * Where the long-press overlay puts the Tapback bar and the action menu around a bubble, in the
 * chat root's coordinates. iMessage keeps the bar above the bubble and the menu below it; near the
 * bottom both go above, near the top both go below. The bubble itself never moves.
 */
export type MessageMenuLayoutInput = {
  bubble: { x: number; y: number; width: number; height: number };
  rootWidth: number;
  rootHeight: number;
  /** Below the transparent navigation bar. */
  minTop: number;
  /** Above the home indicator / composer edge. */
  bottomLimit: number;
  barHeight: number;
  /** 0 when the bar is not shown (offline, local message). */
  showBar: boolean;
  menuWidth: number;
  menuHeight: number;
  isOwn: boolean;
  gap: number;
  sideInset: number;
};

export type MessageMenuLayout = {
  barTop: number;
  menuTop: number;
  menuLeft: number;
  /** The menu grows from the edge nearest the bubble. */
  menuBelowBubble: boolean;
};

export function layoutMessageMenu(input: MessageMenuLayoutInput): MessageMenuLayout {
  const { bubble, gap } = input;
  const bar = input.showBar ? input.barHeight + gap : 0;
  const top = input.minTop;
  const bottom = input.rootHeight - input.bottomLimit;
  const bubbleBottom = bubble.y + bubble.height;
  const spaceAbove = bubble.y - gap - top;
  const spaceBelow = bottom - bubbleBottom - gap;
  const menuLeft = Math.min(
    Math.max(input.sideInset, input.isOwn ? bubble.x + bubble.width - input.menuWidth : bubble.x),
    input.rootWidth - input.sideInset - input.menuWidth,
  );

  // Bar above, menu below (the usual case).
  if (spaceAbove >= bar && spaceBelow >= input.menuHeight) {
    return { barTop: bubble.y - bar, menuTop: bubbleBottom + gap, menuLeft, menuBelowBubble: true };
  }
  // Near the top: bar, then menu, both below.
  if (spaceBelow >= bar + input.menuHeight) {
    return {
      barTop: bubbleBottom + gap,
      menuTop: bubbleBottom + gap + bar,
      menuLeft,
      menuBelowBubble: true,
    };
  }
  // Near the bottom: menu right above the bubble, bar above the menu.
  if (spaceAbove >= bar + input.menuHeight) {
    const menuTop = bubble.y - gap - input.menuHeight;
    return { barTop: menuTop - bar, menuTop, menuLeft, menuBelowBubble: false };
  }
  // A bubble taller than the screen: keep both on screen, over the bubble.
  const menuTop = Math.max(top + bar, bottom - input.menuHeight);
  return { barTop: Math.max(top, menuTop - bar), menuTop, menuLeft, menuBelowBubble: false };
}
