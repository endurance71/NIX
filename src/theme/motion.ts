/**
 * Wspólne tokeny motion NiX — Apple HIG / iMessage feel.
 * Animacje: Reanimated 4 na UI thread; respektuj Reduce Motion.
 */
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Sprężyna z wyraźnym bounce: odpowiednik SwiftUI `.spring(response: 0.40, dampingFraction: 0.64)`
 * (ζ = 17 / (2·√(210·0.85)) ≈ 0.64). Zostaje dla istniejących efektów (Tapback, fokus dymka);
 * nowe animacje bez gestu biorą `motion.spring.default`.
 */
export const appleUiSpring = { damping: 17, stiffness: 210, mass: 0.85 } as const;

/**
 * Sprężyny Reanimated (`withSpring(to, motion.spring.*)`), opisane jak w SwiftUI:
 * response = 2π/√(k/m), dampingFraction ζ = c / (2·√(k·m)).
 */
export const motion = {
  spring: {
    /**
     * Zdarzenia bez gestu (pojawienie się, zmiana stanu, fokus): response ≈ 0.35 s, ζ ≈ 0.89 —
     * prawie krytycznie tłumiona, bez widocznego przestrzelenia (jak SwiftUI `.smooth`).
     */
    default: { damping: 32, stiffness: 320, mass: 1 },
    /**
     * Dociągnięcie po puszczeniu gestu (drag/swipe): response ≈ 0.30 s, ζ ≈ 0.81 — szybsza,
     * z minimalnym dobiciem, które przenosi prędkość palca (jak SwiftUI `.snappy`).
     * Przekaż `velocity` z gestu.
     */
    gesture: { damping: 34, stiffness: 440, mass: 1 },
  },
} as const;

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
