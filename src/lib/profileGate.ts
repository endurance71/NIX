import type { CurrentUserProfileRow } from '../services/profileService';

export function resolveNeedsOnboarding(
  hasSession: boolean,
  profile: CurrentUserProfileRow | null | undefined,
  profileError: boolean
): boolean {
  if (!hasSession) return false;
  if (profileError) return true;
  return !profile?.username;
}
