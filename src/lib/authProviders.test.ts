import { describe, expect, it } from 'vitest';
import type { User, UserIdentity } from '@supabase/supabase-js';
import { userHasEmailPasswordIdentity } from '../lib/authProviders';

function makeUser(identities: UserIdentity[]): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    identities,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  } as User;
}

describe('userHasEmailPasswordIdentity', () => {
  it('zwraca true gdy użytkownik ma provider email', () => {
    const user = makeUser([{ provider: 'email', id: '1' } as UserIdentity]);
    expect(userHasEmailPasswordIdentity(user)).toBe(true);
  });

  it('zwraca false gdy użytkownik ma tylko provider apple', () => {
    const user = makeUser([{ provider: 'apple', id: '1' } as UserIdentity]);
    expect(userHasEmailPasswordIdentity(user)).toBe(false);
  });

  it('zwraca false dla braku użytkownika', () => {
    expect(userHasEmailPasswordIdentity(null)).toBe(false);
    expect(userHasEmailPasswordIdentity(undefined)).toBe(false);
  });
});
