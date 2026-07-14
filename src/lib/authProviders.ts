import type { User } from '@supabase/supabase-js';

export function userHasEmailPasswordIdentity(user: User | null | undefined): boolean {
  return user?.identities?.some((identity) => identity.provider === 'email') ?? false;
}
