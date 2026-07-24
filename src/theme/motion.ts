/**
 * Wspólne tokeny motion NiX — Apple HIG / iMessage feel.
 * Animacje: Reanimated 4 na UI thread; respektuj Reduce Motion.
 */
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Spring jak SwiftUI `.spring(response: 0.38, dampingFraction: 0.72)` —
 * lekki bounce, płynne dociąganie (Tapback, fokus dymka).
 */
export const appleUiSpring = { damping: 17, stiffness: 210, mass: 0.85 } as const;

export const duration = {
  /** Mikro-feedback, flash, short fades. */
  fast: 120,
  /** Picker dismiss, enter wiadomości, keyboard-ish. */
  medium: 180,
  /** Soft settle. */
  slow: 280,
} as const;

/** Skala wciśnięcia przycisku (1 → pressScale → 1). */
export const pressScaleTo = 0.96;

/**
 * Czy wolno stosować enter/spring polish.
 * `useReducedMotion` czyta ustawienie systemowe z startu appki (bez re-render przy zmianie).
 */
export function useMotionEnabled(): boolean {
  return !useReducedMotion();
}
