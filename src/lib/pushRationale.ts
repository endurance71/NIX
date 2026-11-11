export type PushRationaleSource = 'onboarding' | 'after_send';

/**
 * docs/push-notifications.md: one rationale after onboarding, and once more after the first
 * successful send if push is still off (NOTIF-12). Since App Review 5.1.1(iv) the rationale has a
 * single „Dalej” that always leads to the system prompt, so the second offer only appears when that
 * prompt never ran. The caller has already excluded enabled/denied/unavailable states.
 * Returns the flags to persist before showing, or null when nothing should be shown.
 */
export function decidePushRationale(
  source: PushRationaleSource,
  offered: { onboarding: boolean; afterSend: boolean }
): { onboarding: true; afterSend: boolean } | null {
  if (source === 'onboarding') {
    return offered.onboarding ? null : { onboarding: true, afterSend: offered.afterSend };
  }
  if (offered.afterSend) return null;
  // First offer ever comes from a send (onboarding prompt never ran): it counts as both offers.
  return { onboarding: true, afterSend: true };
}
