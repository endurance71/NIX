import { describe, expect, it, vi } from 'vitest';
import { encryptedPhotoCache } from './encryptedPhotoCache';

const { db, clearKey } = vi.hoisted(() => ({
  db: { execAsync: vi.fn(), runAsync: vi.fn(), getAllAsync: vi.fn(), getFirstAsync: vi.fn() },
  clearKey: vi.fn(),
}));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn(async () => db) }));
vi.mock('expo-crypto', () => ({}));
vi.mock('./accountEncryptionKeys', () => ({
  accountEncryptionKeys: { clear: clearKey },
  AccountStorageCancelledError: class extends Error {},
}));

describe('SQLite cache storage bounds', () => {
  it('caps database pages and clears an account with separate bounded deletions', async () => {
    db.getAllAsync.mockResolvedValueOnce([{ nixId: 'one' }, { nixId: 'two' }]);
    await encryptedPhotoCache.clear('a');
    const pragmas = db.execAsync.mock.calls[0][0];
    expect(pragmas).toContain('PRAGMA max_page_count = 122880;');
    expect(pragmas).toContain('PRAGMA auto_vacuum = FULL;');
    expect(pragmas).toContain('PRAGMA journal_mode = DELETE;');
    expect(db.runAsync.mock.calls).toEqual([
      ['DELETE FROM encrypted_photos WHERE owner_id = ? AND nix_id = ?', 'a', 'one'],
      ['DELETE FROM encrypted_photos WHERE owner_id = ? AND nix_id = ?', 'a', 'two'],
    ]);
    expect(clearKey).toHaveBeenCalledWith('nix.photo-cache.key.v1.a');
  });

  it('loads only metadata in list and only the requested ciphertext for a read', async () => {
    db.getAllAsync.mockResolvedValueOnce([]);
    db.getFirstAsync.mockResolvedValueOnce(null);
    await encryptedPhotoCache.entries('b');
    expect(db.getAllAsync.mock.calls.at(-1)?.[0]).not.toContain('ciphertext');
    expect(await encryptedPhotoCache.read('b', 'two', 'b/two')).toBeNull();
    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE owner_id = ? AND nix_id = ?'), 'b', 'two');
  });
});
