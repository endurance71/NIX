// Adapted from rit3zh/expo-dynamic-notifications, commit 5de059a. See LICENSE.
function clamp<T extends number>(value: T, min: T, max: T): T {
  "worklet";

  return Math.min(Math.max(value, min), max) as T;
}

export { clamp };
