import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FINISHED_UPLOAD_RETENTION_MS,
  getDurableUploadJob,
  getUploadQueueDatabase,
  listDurableUploadJobs,
  patchDurableUploadJob,
  purgeFinishedDurableUploadJobs,
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

describe('finished job retention', () => {
  async function insertJob(id: string, state: string, finishedAt: number | null, updatedAt = 1) {
    const db = await getUploadQueueDatabase();
    await db.runAsync(`INSERT INTO upload_jobs
      (id, owner_id, media_type, state, staged_uri, created_at, updated_at, expires_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, 'owner', 'image', state, 'file:///image.jpg', 1, updatedAt, 999_999_999, finishedAt);
    await db.runAsync(`INSERT INTO upload_recipients (job_id, receiver_id, view_duration_sec, sequence_index)
      VALUES (?, ?, ?, ?)`, id, 'friend', 5, 0);
  }

  it('hides and purges finished rows past the window but keeps active and failed work', async () => {
    const now = 100 * FINISHED_UPLOAD_RETENTION_MS;
    const old = now - FINISHED_UPLOAD_RETENTION_MS - 1;
    const recent = now - 1_000;
    await insertJob('old-completed', 'completed', old);
    await insertJob('old-cancelled', 'cancelled', null, old);
    await insertJob('old-expired', 'expired', old);
    await insertJob('recent-completed', 'completed', recent);
    await insertJob('old-failed', 'failed', old);

    const listed = (await listDurableUploadJobs('owner', { now })).map((job) => job.id).sort();
    expect(listed).toEqual(['job', 'old-failed', 'recent-completed']);

    const purged = await purgeFinishedDurableUploadJobs(now);
    expect(purged.sort()).toEqual(['old-cancelled', 'old-completed', 'old-expired']);
    expect(await getDurableUploadJob('old-completed')).toBeNull();
    expect(await getDurableUploadJob('recent-completed')).not.toBeNull();
    expect(await getDurableUploadJob('old-failed')).not.toBeNull();
    const db = await getUploadQueueDatabase();
    const orphanRecipients = await db.getAllAsync<{ job_id: string }>(
      'SELECT job_id FROM upload_recipients WHERE job_id = ?', 'old-completed'
    );
    expect(orphanRecipients).toEqual([]);
    expect(await purgeFinishedDurableUploadJobs(now)).toEqual([]);
  });
});

describe('offline preparation persistence (OFF-11)', () => {
  it('claims a job only from the expected states (compare-and-set)', async () => {
    await patchDurableUploadJob('job', { state: 'waiting_network' });
    const claim = () => patchDurableUploadJob('job', { state: 'requesting_target' }, {
      onlyStates: ['queued', 'waiting_network', 'retry_scheduled'],
    });
    expect((await claim()).changes).toBe(1);
    // The second claimant (foreground vs background) loses.
    expect((await claim()).changes).toBe(0);
    expect((await getDurableUploadJob('job'))?.state).toBe('requesting_target');
    expect((await patchDurableUploadJob('job', { state: 'queued' }, { onlyStates: [] })).changes).toBe(0);
  });

  it('combines the allow-list with the stop-list', async () => {
    await patchDurableUploadJob('job', { state: 'paused' });
    const result = await patchDurableUploadJob('job', { state: 'waiting_network' }, {
      onlyStates: ['queued', 'paused'],
      unlessStates: ['paused'],
    });
    expect(result.changes).toBe(0);
  });

  it('keeps everything begin needs after preparing offline, for a later read (restart)', async () => {
    await patchDurableUploadJob('job', {
      preparedUri: 'file:///NiX/Uploads/job/prepared.jpg',
      contentType: 'image/jpeg',
      fileExtension: 'jpg',
      finalSizeBytes: 123_456,
      bytesTotal: 123_456,
      thumbnailB64: 'data:image/jpeg;base64,AAAA',
      state: 'waiting_network',
      progress: 0.25,
      nextAttemptAt: null,
    }, { unlessStates: [...stopped] });
    const [restored] = await listDurableUploadJobs('owner');
    expect(restored).toMatchObject({
      state: 'waiting_network',
      preparedUri: 'file:///NiX/Uploads/job/prepared.jpg',
      contentType: 'image/jpeg',
      fileExtension: 'jpg',
      finalSizeBytes: 123_456,
      bytesTotal: 123_456,
      thumbnailB64: 'data:image/jpeg;base64,AAAA',
      progress: 0.25,
      nextAttemptAt: null,
      batchId: null,
      uploadUrl: null,
    });
  });
});
