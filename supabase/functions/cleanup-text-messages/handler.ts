import { json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

const BATCH_SIZE = 500;

export type ExpiredTextStore = {
  listExpiredIds(limit: number): Promise<string[]>;
  deleteIds(ids: string[]): Promise<number>;
};

/** Cron-only sweep of expired text messages; rejects anything but the service role. */
export async function handleCleanupTextMessages(
  req: Request,
  serviceKey: string,
  store: ExpiredTextStore,
): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!hasServiceRoleBearer(req, serviceKey)) return json({ error: 'AUTH_REQUIRED' }, 401);

  try {
    let totalDeleted = 0;
    let batchDeleted = 0;
    do {
      const ids = await store.listExpiredIds(BATCH_SIZE);
      if (ids.length === 0) break;
      batchDeleted = await store.deleteIds(ids);
      totalDeleted += batchDeleted;
    } while (batchDeleted >= BATCH_SIZE);
    return json({ ok: true, deletedCount: totalDeleted });
  } catch (error) {
    console.error('cleanup-text-messages failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'TEXT_CLEANUP_FAILED' }, 500);
  }
}
