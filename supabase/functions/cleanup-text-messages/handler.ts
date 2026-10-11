import { json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

const BATCH_SIZE = 500;
const VOICE_BATCH_SIZE = 100;
/** Bounded so one cron tick can never run away; the next tick continues. */
const MAX_VOICE_BATCHES = 10;

export type ExpiredTextStore = {
  listExpiredIds(limit: number): Promise<string[]>;
  deleteIds(ids: string[]): Promise<number>;
  /**
   * Voice audio queued for removal (deleted / expired voice messages and abandoned uploads).
   * Returns `null` when the backend has no voice support yet (migration not deployed).
   */
  claimVoiceObjects?(limit: number): Promise<string[] | null>;
  removeVoiceObjects?(paths: string[]): Promise<void>;
  completeVoiceObjects?(paths: string[]): Promise<void>;
};

async function sweepVoiceObjects(store: ExpiredTextStore): Promise<number> {
  if (!store.claimVoiceObjects || !store.removeVoiceObjects || !store.completeVoiceObjects) return 0;
  let removed = 0;
  for (let batch = 0; batch < MAX_VOICE_BATCHES; batch += 1) {
    const paths = await store.claimVoiceObjects(VOICE_BATCH_SIZE);
    if (!paths || paths.length === 0) break;
    // Storage first: a path leaves the queue only once its object is gone (or never existed).
    await store.removeVoiceObjects(paths);
    await store.completeVoiceObjects(paths);
    removed += paths.length;
    if (paths.length < VOICE_BATCH_SIZE) break;
  }
  return removed;
}

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

    // Deleting the rows above queued their audio; remove it in the same tick.
    let voiceObjectsRemoved = 0;
    try {
      voiceObjectsRemoved = await sweepVoiceObjects(store);
    } catch (error) {
      // Text expiry already succeeded; the queue keeps the paths for the next tick.
      console.error('cleanup-text-messages voice sweep failed', error instanceof Error ? error.name : 'unknown');
    }
    return json({ ok: true, deletedCount: totalDeleted, voiceObjectsRemoved });
  } catch (error) {
    console.error('cleanup-text-messages failed', error instanceof Error ? error.name : 'unknown');
    return json({ error: 'TEXT_CLEANUP_FAILED' }, 500);
  }
}
