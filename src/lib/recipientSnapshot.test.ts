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
import { clearRecipientSnapshot, readRecipientSnapshot } from './recipientSnapshot';

function seedRecipientSnapshot(userId: string) {
  storage.set(`nix.accepted-recipients.v1.${userId}`, JSON.stringify({
    version: 1,
    userId,
    writtenAt: '2026-08-25T12:00:00.000Z',
    recipients: [{ id: 'friend', username: 'nix' }],
  }));
}

describe('recipient snapshot', () => {
  beforeEach(() => storage.clear());

  it('is account scoped', async () => {
    seedRecipientSnapshot('user-a');
    expect(await readRecipientSnapshot('user-a')).toMatchObject({
      userId: 'user-a', recipients: [{ id: 'friend', username: 'nix' }],
    });
    expect(await readRecipientSnapshot('user-b')).toBeNull();
  });

  it('can be cleared on sign-out', async () => {
    seedRecipientSnapshot('user-a');
    await clearRecipientSnapshot('user-a');
    expect(await readRecipientSnapshot('user-a')).toBeNull();
  });
});
