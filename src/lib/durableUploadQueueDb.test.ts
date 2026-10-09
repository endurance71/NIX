import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDurableUploadJob, getUploadQueueDatabase, patchDurableUploadJob } from './durableUploadQueueDb';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    const sqlite = new DatabaseSync(':memory:');
    return {
      execAsync: async (sql: string) => { sqlite.exec(sql); },
      runAsync: async (sql: string, ...values: (string | number | null)[]) => sqlite.prepare(sql).run(...values),
      getAllAsync: async (sql: string, ...values: (string | number | null)[]) => sqlite.prepare(sql).all(...values),
      getFirstAsync: async (sql: string, ...values: (string | number | null)[]) => sqlite.prepare(sql).get(...values),
    };
  },
}));

const stopped = ['paused', 'cancelled', 'expired', 'completed', 'partially_completed'] as const;
beforeEach(async () => {
  const db = await getUploadQueueDatabase();
  await db.execAsync('DELETE FROM upload_jobs');
  await db.runAsync(`INSERT INTO upload_jobs
    (id, owner_id, media_type, state, staged_uri, created_at, updated_at, expires_at, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'job', 'owner', 'image', 'preparing', 'file:///image.jpg', 1, 1, 100_000, 15_000);
});

describe('atomic durable upload control', () => {
  it.each(stopped)('rejects late progress, completion and retry after %s', async (state) => {
    // A callback read the job before control changed. Its eventual UPDATE must
    // check the latest database state, even without a second JS read.
    const beforePause = await getDurableUploadJob('job');
    expect(beforePause?.state).toBe('preparing');
    await patchDurableUploadJob('job', { state });
    for (const proposed of ['uploading', 'completed', 'retry_scheduled'] as const) {
      const result = await patchDurableUploadJob('job', { state: proposed, progress: 1, nextAttemptAt: null },
        { unlessStates: [...stopped] });
      expect(result.changes).toBe(0);
      expect(await getDurableUploadJob('job')).toMatchObject({ state, progress: 0, nextAttemptAt: 15_000 });
    }
  });
  it('allows progress on an active job and explicit resume retains the deadline', async () => {
    expect((await patchDurableUploadJob('job', { progress: 0.5 }, { unlessStates: [...stopped] })).changes).toBe(1);
    await patchDurableUploadJob('job', { state: 'paused' });
    await patchDurableUploadJob('job', { state: 'retry_scheduled' });
    expect(await getDurableUploadJob('job')).toMatchObject({ state: 'retry_scheduled', progress: 0.5, nextAttemptAt: 15_000 });
  });
});
