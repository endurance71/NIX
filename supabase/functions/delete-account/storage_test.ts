import { assertEquals } from 'jsr:@std/assert@1';
import { STORAGE_LIST_PAGE_SIZE, emptyStoragePrefix, type StorageListItem } from './storage.ts';

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
