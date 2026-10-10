import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDurableUploadJob,
  getUploadQueueDatabase,
  patchDurableUploadJob,
  purgeOwnerDurableUploadJobs,
} from './durableUploadQueueDb';

const clearedKeys: string[] = [];
vi.mock('./uploadQueueSecrets', () => ({
  // Reversible stand-in for AES-GCM that still binds the row identity.
  uploadQueueSecretsCodec: {
    seal: async (ownerId: string, jobId: string, secrets: unknown) =>
      `sealed:${Buffer.from(JSON.stringify([ownerId, jobId, secrets])).toString('base64')}`,
    open: async (ownerId: string, jobId: string, sealed: string) => {
      const [sealedOwner, sealedJob, secrets] = JSON.parse(
        Buffer.from(sealed.slice('sealed:'.length), 'base64').toString()
      );
      if (sealedOwner !== ownerId || sealedJob !== jobId) throw new Error('AAD mismatch');
      return secrets;
    },
    clear: async (ownerId: string) => {
      clearedKeys.push(ownerId);
    },
  },
}));

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

describe('upload capability secrets at rest', () => {
  it('never stores the upload URL or finalize token in plaintext columns', async () => {
    await patchDurableUploadJob('job', {
      uploadUrl: 'https://storage.example/upload?token=secret-upload',
      finalizeToken: 'secret-finalize',
    });
    const db = await getUploadQueueDatabase();
    const raw = await db.getFirstAsync<Record<string, string | null>>('SELECT * FROM upload_jobs WHERE id = ?', 'job');
    expect(raw?.upload_url).toBeNull();
    expect(raw?.finalize_token).toBeNull();
    expect(JSON.stringify(raw)).not.toContain('secret-upload');

    const job = await getDurableUploadJob('job');
    expect(job?.uploadUrl).toBe('https://storage.example/upload?token=secret-upload');
    expect(job?.finalizeToken).toBe('secret-finalize');
  });

  it('keeps the other secret when only one is patched', async () => {
    await patchDurableUploadJob('job', { uploadUrl: 'https://u', finalizeToken: 'f' });
    await patchDurableUploadJob('job', { uploadUrl: null });
    const job = await getDurableUploadJob('job');
    expect(job?.uploadUrl).toBeNull();
    expect(job?.finalizeToken).toBe('f');
  });

  it('hides another owner\'s job and clears the key on purge', async () => {
    expect(await getDurableUploadJob('job', 'someone-else')).toBeNull();
    expect(await getDurableUploadJob('job', 'owner')).not.toBeNull();
    await purgeOwnerDurableUploadJobs('owner');
    expect(clearedKeys).toContain('owner');
  });
});
