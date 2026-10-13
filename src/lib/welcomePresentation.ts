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
 * can be replaced right away by a redirect (a new account briefly lands on the tabs before its
 * profile step); leaving the tabs for anything but the tour itself cancels that attempt, so the
 * tour opens again once the account reaches the tabs for real.
 */
export function shouldOpenWelcome(userId: string, topRoute: string | undefined): boolean {
  if (seenFor === userId || topRoute === 'welcome') return false;
  if (topRoute !== '(tabs)') {
    if (openingFor === userId) openingFor = null;
    return false;
  }
  if (openingFor === userId) return false;
  openingFor = userId;
  return true;
}
