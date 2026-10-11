import { describe, expect, it } from 'vitest';
import { layoutMessageMenu, type MessageMenuLayoutInput } from './chatMessageMenuLayout';

const base: MessageMenuLayoutInput = {
  bubble: { x: 200, y: 400, width: 160, height: 40 },
  rootWidth: 390,
  rootHeight: 844,
  minTop: 100,
  bottomLimit: 40,
  barHeight: 56,
  showBar: true,
  menuWidth: 250,
  menuHeight: 220,
  isOwn: true,
  gap: 8,
  sideInset: 16,
};

describe('layoutMessageMenu', () => {
  it('puts the bar above and the menu below a bubble in the middle', () => {
    expect(layoutMessageMenu(base)).toEqual({ barTop: 336, menuTop: 448, menuLeft: 110, menuBelowBubble: true });
  });

  it('aligns the menu with an incoming bubble’s leading edge, clamped to the screen', () => {
    expect(layoutMessageMenu({ ...base, isOwn: false, bubble: { ...base.bubble, x: 12 } }).menuLeft).toBe(16);
  });

  it('moves both below a bubble right under the header', () => {
    expect(layoutMessageMenu({ ...base, bubble: { ...base.bubble, y: 110 } })).toMatchObject({
      barTop: 158,
      menuTop: 222,
      menuBelowBubble: true,
    });
  });

  it('moves both above a bubble near the composer', () => {
    expect(layoutMessageMenu({ ...base, bubble: { ...base.bubble, y: 740 } })).toMatchObject({
      menuTop: 512,
      barTop: 448,
      menuBelowBubble: false,
    });
  });

  it('needs no room for a hidden bar', () => {
    expect(layoutMessageMenu({ ...base, showBar: false, bubble: { ...base.bubble, y: 104 } })).toMatchObject({
      menuTop: 152,
      menuBelowBubble: true,
    });
  });

  it('keeps everything on screen for a bubble taller than the screen', () => {
    const layout = layoutMessageMenu({ ...base, bubble: { ...base.bubble, y: 90, height: 760 } });
    expect(layout.menuTop + base.menuHeight).toBeLessThanOrEqual(base.rootHeight - base.bottomLimit);
    expect(layout.barTop).toBeGreaterThanOrEqual(base.minTop);
  });
});
