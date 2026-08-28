import { assertEquals } from 'jsr:@std/assert@1';
import {
  STORAGE_LIST_PAGE_SIZE,
  cleanupUserStorage,
  emptyStoragePrefix,
  type StorageListItem,
  type StoragePort,
} from './storage.ts';

function recordingStorage() {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const storage: StoragePort = {
    list: async () => [],
    remove: async (bucket, paths) => {
      removed.push({ bucket, paths });
    },
  };
  return { storage, removed };
}

Deno.test('ponad 1000 obiektów jest usuwane w kolejnych iteracjach', async () => {
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

Deno.test('1001 odebranych mediów spoza nixes/<userId> jest usuwane w dwóch wywołaniach remove', async () => {
  const userId = 'user-1';
  const mediaPaths = Array.from(
    { length: STORAGE_LIST_PAGE_SIZE + 1 },
    (_, index) => `nixes/sender-2/received-${index}.jpg`
  );
  const { storage, removed } = recordingStorage();

  await cleanupUserStorage(storage, userId, { mediaPaths, avatarPaths: [] });

  const mediaRemoves = removed.filter((call) => call.bucket === 'media-vault');
  assertEquals(mediaRemoves.length, 2);
  assertEquals(mediaRemoves[0].paths.length, STORAGE_LIST_PAGE_SIZE);
  assertEquals(mediaRemoves[1].paths, ['nixes/sender-2/received-1000.jpg']);
  assertEquals(mediaRemoves.flatMap((call) => call.paths), mediaPaths);
  assertEquals(
    mediaRemoves.flatMap((call) => call.paths).every((path) => !path.startsWith(`nixes/${userId}/`)),
    true
  );
});
