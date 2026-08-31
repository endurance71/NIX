import { assertEquals } from 'jsr:@std/assert@1';
import {
  STORAGE_LIST_PAGE_SIZE,
  cleanupUserStorage,
  emptyStoragePrefix,
  type StorageListItem,
  type StoragePort,
} from './storage.ts';

function recordingStorage(ownedObjects: StorageListItem[] = []) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const storage: StoragePort = {
    list: async (_bucket, prefix, page) => {
      if (prefix !== 'nixes/user-1') return [];
      return ownedObjects.slice(page.offset, page.offset + page.limit);
    },
    remove: async (bucket, paths) => {
      removed.push({ bucket, paths });
    },
  };
  return { storage, removed };
}

Deno.test('usunięcie nadawcy nadal kasuje ponad 1000 własnych plików porcjami', async () => {
  const objects: StorageListItem[] = Array.from({ length: STORAGE_LIST_PAGE_SIZE + 1 }, (_, index) => ({
    name: `file-${index}.jpg`,
    id: `id-${index}`,
  }));
  const listPages: Array<{ limit: number; offset: number }> = [];
  const removed: string[][] = [];

  await emptyStoragePrefix(
    {
      list: async (_bucket, _prefix, page) => {
        listPages.push(page);
        return objects.slice(page.offset, page.offset + page.limit);
      },
      remove: async (_bucket, paths) => {
        removed.push(paths);
      },
    },
    'media-vault',
    'nixes/user-1'
  );

  assertEquals(listPages, [
    { limit: STORAGE_LIST_PAGE_SIZE, offset: 0 },
    { limit: STORAGE_LIST_PAGE_SIZE, offset: STORAGE_LIST_PAGE_SIZE },
  ]);
  assertEquals(removed.length, 2);
  assertEquals(removed[0].length, STORAGE_LIST_PAGE_SIZE);
  assertEquals(removed[1], ['nixes/user-1/file-1000.jpg']);
  assertEquals(removed.flat().length, STORAGE_LIST_PAGE_SIZE + 1);
});

Deno.test('podstawione mediaPaths i avatarPaths nie powodują skasowania obiektu', async () => {
  const { storage, removed } = recordingStorage();
  await cleanupUserStorage(storage, 'user-1', {
    mediaPaths: ['nixes/victim/secret.jpg', 'nixes/sender-2/received.jpg'],
    avatarPaths: ['victim/avatar.jpg'],
  });
  assertEquals(removed, []);
});

Deno.test('cleanup kasuje wyłącznie własny prefiks i ignoruje ścieżki odbiorcy', async () => {
  const ownedObjects: StorageListItem[] = Array.from(
    { length: STORAGE_LIST_PAGE_SIZE + 1 },
    (_, index) => ({ name: `own-${index}.jpg`, id: `id-${index}` })
  );
  const receivedPaths = Array.from(
    { length: STORAGE_LIST_PAGE_SIZE + 1 },
    (_, index) => `nixes/other-sender/received-${index}.jpg`
  );
  const { storage, removed } = recordingStorage(ownedObjects);

  await cleanupUserStorage(storage, 'user-1', {
    mediaPaths: receivedPaths,
    avatarPaths: ['other-user/avatar.jpg'],
  });

  const mediaRemoves = removed.filter((call) => call.bucket === 'media-vault');
  const receivedPathSet = new Set(receivedPaths);
  assertEquals(mediaRemoves.length, 2);
  assertEquals(mediaRemoves[0].paths.length, STORAGE_LIST_PAGE_SIZE);
  assertEquals(mediaRemoves.flatMap((call) => call.paths).length, STORAGE_LIST_PAGE_SIZE + 1);
  assertEquals(
    mediaRemoves.flatMap((call) => call.paths).every((path) => path.startsWith('nixes/user-1/')),
    true
  );
  assertEquals(
    mediaRemoves.flatMap((call) => call.paths).some((path) => receivedPathSet.has(path)),
    false
  );
  assertEquals(removed.some((call) => call.bucket === 'avatars'), false);
});
