import { describe, expect, it } from 'vitest';
import { notificationLayout } from './notificationLayout';
import { buildNotificationGeometry } from './vendor/geometry';

describe('notification geometry', () => {
  it.each([20, 44, 47])('uses a safe banner on top inset %s without creating a fake island', (inset) => {
    const layout = notificationLayout(375, inset, 72);
    expect(layout.morph).toBe(false); expect(layout.cardTop).toBe(inset + 12);
  });
  it('keeps the morph card below the safe area and centered on a large iPhone', () => {
    const layout = notificationLayout(440, 62, 104);
    expect(layout.morph).toBe(true); expect(layout.cardWidth).toBe(396);
    expect(layout.cardLeft).toBe(22); expect(layout.cardTop).toBe(85);
    expect(layout.cardHeight).toBe(104); expect(layout.cardRadius).toBe(28);
  });
  it('lets measured Dynamic Type text expand the final geometry', () => {
    const layout = notificationLayout(320, 20, 240);
    const geometry = buildNotificationGeometry({ drop: 1, expand: 1, layout });
    expect(geometry.width).toBe(288); expect(geometry.height).toBe(240);
    expect(geometry.offsetY).toBe(0); expect(geometry.neckWidth).toBe(0);
  });
  it('keeps all geometry values finite throughout entry, overshoot and exit', () => {
    const layout = notificationLayout(393, 59, 110);
    for (const drop of [0, 0.1, 0.3, 0.7, 1, 1.1]) {
      for (const expand of [0, 0.1, 0.5, 1, 1.1]) {
        const geometry = buildNotificationGeometry({ drop, expand, layout });
        expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
        expect(geometry.width).toBeLessThanOrEqual(373);
      }
    }
  });
});
