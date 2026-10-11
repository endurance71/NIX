import type { INotificationLayout } from './vendor/layoutTypes';

/**
 * Geometry hint for portrait iPhones, never used as a hardware capability claim. `allowMorph` is
 * false for the fast card, which then sits under the safe area instead of below the island.
 */
export function notificationLayout(width: number, insetTop: number, cardHeight: number, allowMorph = true): INotificationLayout & { morph: boolean } {
  const morph = allowMorph && insetTop >= 59;
  const islandHeight = 37.33;
  const islandTop = Math.max(12, insetTop - islandHeight - 11);
  const cardWidth = Math.min(Math.max(width - 32, 0), 396);
  const cardTop = morph ? islandTop + islandHeight + 34 : insetTop + 12;
  return {
    morph,
    width,
    centerX: width / 2,
    islandWidth: 126,
    islandHeight,
    islandTop,
    islandBottom: islandTop + islandHeight,
    islandCenterY: islandTop + islandHeight / 2,
    islandRadius: islandHeight / 2,
    cardWidth,
    cardHeight,
    cardRadius: 28,
    cardTop,
    cardLeft: (width - cardWidth) / 2,
    cardCenterY: cardTop + cardHeight / 2,
    dropSize: 52,
    neckWidth: 60,
    canvasHeight: cardTop + cardHeight + 96,
  };
}
