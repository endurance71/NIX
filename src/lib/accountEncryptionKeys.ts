import { AESEncryptionKey, AESKeySize } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export class AccountStorageCancelledError extends Error {
  constructor() { super('Account storage cleared'); this.name = 'AbortError'; }
}

/** Per-key serialization includes clear, so late key creation cannot undo logout. */
export function createAccountEncryptionKeyStore(
  storage: Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'> = SecureStore,
  crypto: Pick<typeof AESEncryptionKey, 'generate' | 'import'> = AESEncryptionKey
) {
  const tails = new Map<string, Promise<unknown>>();
  const versions = new Map<string, number>();
  const keys = new Map<string, AESEncryptionKey>();
  function serial<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const next = (tails.get(name) ?? Promise.resolve()).catch(() => {}).then(operation);
    tails.set(name, next);
    void next.finally(() => { if (tails.get(name) === next) tails.delete(name); }).catch(() => {});
    return next;
  }
  function get(name: string) {
    const version = versions.get(name) ?? 0;
    const assertActive = () => {
      if ((versions.get(name) ?? 0) !== version) throw new AccountStorageCancelledError();
    };
    return serial(name, async () => {
      assertActive();
      const existing = keys.get(name);
      if (existing) return existing;
      const encoded = await storage.getItemAsync(name, OPTIONS);
      assertActive();
      const key = encoded ? await crypto.import(encoded, 'base64') : await crypto.generate(AESKeySize.AES256);
      assertActive();
      if (!encoded) {
        const value = await key.encoded('base64');
        assertActive();
        await storage.setItemAsync(name, value, OPTIONS);
        assertActive();
      }
      keys.set(name, key);
      return key;
    });
  }
  function clear(name: string) {
    versions.set(name, (versions.get(name) ?? 0) + 1);
    keys.delete(name);
    return serial(name, () => storage.deleteItemAsync(name, OPTIONS));
  }
  return { get, clear };
}

export const accountEncryptionKeys = createAccountEncryptionKeyStore();
