import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

// The module import intentionally follows the hoisted storage mock.
// eslint-disable-next-line import/first
import {
  clearProfileBootstrapSnapshot,
  readProfileBootstrapSnapshot,
  writeProfileBootstrapSnapshot,
} from './profileBootstrapSnapshot';

describe('profile bootstrap snapshot', () => {
  beforeEach(() => storage.clear());

  it('jest ściśle przypisany do konta', async () => {
    await writeProfileBootstrapSnapshot('user-a');
    expect(await readProfileBootstrapSnapshot('user-a')).toMatchObject({ userId: 'user-a', profileComplete: true });
    expect(await readProfileBootstrapSnapshot('user-b')).toBeNull();
  });

  it('odrzuca inną wersję polityki i daje się jawnie usunąć', async () => {
    storage.set('nix.profile-bootstrap.v1.user-a', JSON.stringify({
      userId: 'user-a', profileComplete: true, agePolicyVersion: 'old', verifiedAt: new Date().toISOString(),
    }));
    expect(await readProfileBootstrapSnapshot('user-a')).toBeNull();
    await writeProfileBootstrapSnapshot('user-a');
    await clearProfileBootstrapSnapshot('user-a');
    expect(await readProfileBootstrapSnapshot('user-a')).toBeNull();
  });
});
