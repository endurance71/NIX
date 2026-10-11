type ErrorResult = { message: string } | null;
export type CleanupService = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErrorResult }>;
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ error: ErrorResult }> } };
};

/** No client/queue path enters Storage: only the locked canonical SQL result. */
export async function cleanupCanonicalNix(service: CleanupService, nixId: string) {
  const { data, error } = await service.rpc('prepare_nix_cleanup', { p_nix_id: nixId });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as {
    storage_path?: unknown; should_delete?: unknown; asset_id?: unknown;
  } | null;
  if (!row || typeof row.storage_path !== 'string' || typeof row.should_delete !== 'boolean') {
    throw new Error('INVALID_CLEANUP_TARGET');
  }
  let removed = false;
  if (row.should_delete) {
    const { error: removeError } = await service.storage.from('media-vault').remove([row.storage_path]);
    if (removeError) {
      const { error: retryError } = await service.rpc('finish_nix_cleanup', {
        p_nix_id: nixId, p_removed: false, p_error: removeError.message,
      });
      if (retryError) throw new Error(retryError.message);
      throw new Error('STORAGE_CLEANUP_RETRY');
    }
    removed = true;
  }
  const { error: finishError } = await service.rpc('finish_nix_cleanup', {
    p_nix_id: nixId, p_removed: removed, p_error: null,
  });
  if (finishError) throw new Error(finishError.message);
  return { deleted: removed, archived: true, shared: row.asset_id != null };
}
