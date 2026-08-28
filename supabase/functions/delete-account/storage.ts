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

export function uniqueStoragePaths(paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const path of paths) {
    const trimmed = typeof path === 'string' ? path.trim() : '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

export async function collectPagedRows<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = STORAGE_LIST_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return rows;
}

export async function removeStoragePaths(
  storage: StoragePort,
  bucket: string,
  paths: Array<string | null | undefined>
): Promise<void> {
  const unique = uniqueStoragePaths(paths);
  for (let index = 0; index < unique.length; index += STORAGE_LIST_PAGE_SIZE) {
    await storage.remove(bucket, unique.slice(index, index + STORAGE_LIST_PAGE_SIZE));
  }
}

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

  await removeStoragePaths(storage, bucket, files);
  for (const directory of directories) {
    await emptyStoragePrefix(storage, bucket, directory);
  }
}

export async function cleanupUserStorage(
  storage: StoragePort,
  userId: string,
  paths: { mediaPaths: string[]; avatarPaths: string[] }
): Promise<void> {
  await emptyStoragePrefix(storage, 'media-vault', `nixes/${userId}`);
  await emptyStoragePrefix(storage, 'avatars', userId);
  await removeStoragePaths(storage, 'media-vault', paths.mediaPaths);
  await removeStoragePaths(storage, 'avatars', paths.avatarPaths);
}
