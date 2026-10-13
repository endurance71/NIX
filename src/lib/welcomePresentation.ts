// Per app run, in memory: the welcome tour opens after every sign-in or sign-up and is
// forgotten on sign-out. Module state on purpose: right after sign-up the whole provider tree can
// mount again (the session reads as empty for a moment), and component state would forget that
// this run started signed out.
let seenFor: string | null = null;
let openingFor: string | null = null;
let sawSignedOut = false;

/** Called on every auth change; only a confirmed signed-out state counts (not "still loading"). */
export function noteAuthState(signedOut: boolean) {
  if (signedOut) sawSignedOut = true;
}

/** A session that appeared after this run saw the signed-out state, i.e. a fresh sign-in. */
export function isSignedInThisRun(userId: string | null): boolean {
  return sawSignedOut && Boolean(userId);
}

/** Called when the person closes the tour; until then it may be shown again. */
export function markWelcomeSeen(userId: string | null) {
  if (userId) seenFor = userId;
  openingFor = null;
}

export function resetWelcome() {
  seenFor = null;
  openingFor = null;
}

/** Test helper: a new app run. */
export function resetWelcomeRunForTests() {
  resetWelcome();
  sawSignedOut = false;
}

/**
 * Whether to open the tour now. `segments[0]` is the current top route. A tour opened on the tabs
 * can be replaced right away by a redirect: a new account briefly lands on the tabs before its
 * profile step, and after that step two redirects to the tabs race, so the later one can replace
 * the tour itself. Only closing the tour marks it seen; until then, coming back to the tabs (from
 * the tour or from anywhere else) opens it again, while a push still on its way is not repeated.
 */
export function shouldOpenWelcome(userId: string, topRoute: string | undefined): boolean {
  if (seenFor === userId) return false;
  if (topRoute === 'welcome') {
    // The push arrived; if a redirect replaces the tour now, the next visit to the tabs reopens it.
    if (openingFor === userId) openingFor = null;
    return false;
  }
  if (topRoute !== '(tabs)') {
    if (openingFor === userId) openingFor = null;
    return false;
  }
  if (openingFor === userId) return false;
  openingFor = userId;
  return true;
}

/** True from a fresh sign-in until the tour is closed, including the moments before it opens. */
export function isWelcomePending(userId: string | null, signedInNow: boolean): boolean {
  return Boolean(userId) && signedInNow && seenFor !== userId;
}
