// Per app run, in memory: the welcome tour opens after every sign-in or sign-up and is
// forgotten on sign-out.
let seenFor: string | null = null;
let openingFor: string | null = null;

/** Called when the person closes the tour; until then it may be shown again. */
export function markWelcomeSeen(userId: string | null) {
  if (userId) seenFor = userId;
  openingFor = null;
}

export function resetWelcome() {
  seenFor = null;
  openingFor = null;
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
