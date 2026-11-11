type PermissionResponseLike = { granted: boolean; canAskAgain: boolean };

/**
 * - `granted`: access is on.
 * - `refused`: the user just answered "Don't Allow" in the system prompt. App Review 5.1.1(iv):
 *   respect it, never follow it with a push to Settings.
 * - `blocked`: access was already refused before this tap, so the system prompt cannot appear.
 *   Only now may the app explain the feature and offer a link to Settings.
 */
export type PermissionRequestOutcome = 'granted' | 'refused' | 'blocked';

/** Checks the current state first, so a fresh refusal and an earlier one can be told apart. */
export async function requestPermissionRespectingRefusal(
  get: () => Promise<PermissionResponseLike>,
  request: () => Promise<PermissionResponseLike>
): Promise<PermissionRequestOutcome> {
  const before = await get();
  if (before.granted) return 'granted';
  if (!before.canAskAgain) return 'blocked';
  const after = await request();
  return after.granted ? 'granted' : 'refused';
}
