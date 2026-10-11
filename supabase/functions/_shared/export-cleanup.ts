export type ExportCleanupRow = { id: string; storage_path: string };
export async function cleanupExportArchives(
  rows: ExportCleanupRow[],
  remove: (path: string) => Promise<{ error: { message: string } | null }>,
  acknowledge: (id: string, error: string | null) => Promise<void>,
) {
  let removed = 0;
  let retry = 0;
  for (const row of rows) {
    try {
      const { error } = await remove(row.storage_path);
      if (error) {
        await acknowledge(row.id, 'EXPORT_STORAGE_CLEANUP_RETRY');
        retry += 1;
        continue;
      }
      await acknowledge(row.id, null);
      removed += 1;
    } catch {
      // Storage or ACK exceptions leave the persisted path available for retry.
      retry += 1;
    }
  }
  return { removed, retry };
}
