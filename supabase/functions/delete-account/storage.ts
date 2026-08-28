export const STORAGE_LIST_PAGE_SIZE = 1000;

export type StorageListItem = {
  name: string;
  id?: string | null;
};

export type StoragePort = {
  list(
    bucket: string,
    prefix: string,
    page: { limit: number; offset: number }
  ): Promise<StorageListItem[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
};

export async function emptyStoragePrefix(
  storage: StoragePort,
  bucket: string,
  prefix: string
): Promise<void> {
  const files: string[] = [];
  const directories: string[] = [];
  let offset = 0;

  while (true) {
    const page = await storage.list(bucket, prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
    });
    if (!page.length) break;

    for (const item of page) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else directories.push(path);
    }

    if (page.length < STORAGE_LIST_PAGE_SIZE) break;
    offset += page.length;
  }

  for (let index = 0; index < files.length; index += STORAGE_LIST_PAGE_SIZE) {
    await storage.remove(bucket, files.slice(index, index + STORAGE_LIST_PAGE_SIZE));
  }
  for (const directory of directories) {
    await emptyStoragePrefix(storage, bucket, directory);
  }
}
