import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { storage.delete(key); }),
  },
}));

// eslint-disable-next-line import/first
import { clearRecipientSnapshot, readRecipientSnapshot, writeRecipientSnapshot } from './recipientSnapshot';

describe('recipient snapshot', () => {
  beforeEach(() => storage.clear());

  it('is account scoped and stores only recipient presentation fields', async () => {
    await writeRecipientSnapshot('user-a', [{ id: 'friend', username: 'nix', bio: 'not persisted' }]);
    expect(await readRecipientSnapshot('user-a')).toMatchObject({
      userId: 'user-a', recipients: [{ id: 'friend', username: 'nix' }],
    });
    expect(JSON.stringify(await readRecipientSnapshot('user-a'))).not.toContain('not persisted');
    expect(await readRecipientSnapshot('user-b')).toBeNull();
  });

  it('can be cleared on sign-out', async () => {
    await writeRecipientSnapshot('user-a', [{ id: 'friend', username: 'nix' }]);
    await clearRecipientSnapshot('user-a');
    expect(await readRecipientSnapshot('user-a')).toBeNull();
  });
});
