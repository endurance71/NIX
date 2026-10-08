// Adapted from rit3zh/expo-dynamic-notifications, commit 5de059a. See LICENSE.
function mix<T extends number>(progress: number, from: T, to: T): number {
  "worklet";
  return from + (to - from) * progress;
}

export { mix };
