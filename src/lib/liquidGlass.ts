import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * iOS 26+ Liquid Glass with a working `UIGlassEffect` API (some iOS 26 betas lack it).
 * Below that, SwiftUI `glassEffect` is a no-op, so callers draw a solid capsule instead.
 * Reduce Transparency needs no check here: the system glass turns opaque on its own.
 */
export function canUseLiquidGlass(): boolean {
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}
