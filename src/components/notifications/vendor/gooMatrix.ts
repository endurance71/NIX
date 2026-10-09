// Adapted from rit3zh/expo-dynamic-notifications, commit 5de059a. See LICENSE.
import type { IBuildGooMatrix } from "./gooTypes";

function buildGooMatrix({ gain, threshold }: IBuildGooMatrix): number[] {
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, gain, -gain * threshold,
  ];
}

export { buildGooMatrix };
