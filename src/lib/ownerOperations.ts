import { AccountStorageCancelledError } from './accountEncryptionKeys';

export function createOwnerOperations() {
  const tails = new Map<string, Promise<unknown>>();
  const generations = new Map<string, number>();
  function queue<T>(ownerId: string, operation: () => Promise<T>) {
    const next = (tails.get(ownerId) ?? Promise.resolve()).catch(() => {}).then(operation);
    tails.set(ownerId, next);
    void next.finally(() => { if (tails.get(ownerId) === next) tails.delete(ownerId); }).catch(() => {});
    return next;
  }
  function run<T>(ownerId: string, operation: (assertActive: () => void) => Promise<T>) {
    const generation = generations.get(ownerId) ?? 0;
    const assertActive = () => {
      if ((generations.get(ownerId) ?? 0) !== generation) throw new AccountStorageCancelledError();
    };
    return queue(ownerId, async () => { assertActive(); return operation(assertActive); });
  }
  function clear<T>(ownerId: string, operation: () => Promise<T>) {
    generations.set(ownerId, (generations.get(ownerId) ?? 0) + 1);
    return queue(ownerId, operation);
  }
  return { run, clear };
}
