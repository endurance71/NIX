// Adapted from rit3zh/expo-dynamic-notifications, commit 5de059a. See LICENSE.
// Keep the drop, expansion and reveal distinct so the card grows out of the capsule.
export const DROP_SPRING = { duration: 1150, dampingRatio: 0.82 };
export const EXPAND_SPRING = { duration: 1000, dampingRatio: 0.8 };
export const REVEAL_SPRING = { duration: 700, dampingRatio: 1 };
export const TINT_SPRING = { duration: 700, dampingRatio: 1 };
export const COLLAPSE_SPRING = { duration: 660, dampingRatio: 0.92, velocity: 2 };
export const RETURN_SPRING = { duration: 1150, dampingRatio: 0.9 };
export const FADE_SPRING = { duration: 360, dampingRatio: 1 };
export const ENTER_TINT_DELAY = 110;
export const ENTER_EXPAND_DELAY = 340;
export const ENTER_REVEAL_DELAY = 560;
export const EXIT_COLLAPSE_DELAY = 100;
export const EXIT_DROP_DELAY = 280;
export const CONTENT_MIN_SCALE = 0.88;

// NiX fast card (NOTIF-4): readable in ≤ 300 ms, gone in ≤ 220 ms. The upstream morph above
// (~1.3 s to readable text) is reserved for rare `prominent` results.
export const CARD_ENTER_MS = 300;
export const CARD_EXIT_MS = 220;
export const CARD_REDUCED_MOTION_MS = 150;
export const CARD_ENTER_OFFSET = -16;
export const CARD_MIN_SCALE = 0.96;
