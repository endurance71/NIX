import type { User } from '@supabase/supabase-js';

export function userHasEmailPasswordIdentity(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.identities && user.identities.length > 0) {
    return user.identities.some((identity) => identity.provider === 'email');
  }
  const appProvider = user.app_metadata?.provider;
  const providers = user.app_metadata?.providers as string[] | undefined;
  if (appProvider === 'email' || (Array.isArray(providers) && providers.includes('email'))) {
    return true;
  }
  if (user.email && appProvider !== 'google' && appProvider !== 'apple') {
    return true;
  }
  return false;
}
