import { openDatabaseAsync, type SQLiteDatabase, type SQLiteBindValue } from 'expo-sqlite';

import type {
  DurableUploadJob,
  DurableUploadRecipient,
  UploadJobState,
} from '../types/uploadQueue';

const DATABASE_NAME = 'nix-upload-queue.db';
const DATABASE_VERSION = 3;

type UploadJobRow = {
  id: string;
  idempotency_key: string | null;
  owner_id: string;
  media_type: 'image' | 'video';
  state: UploadJobState;
  staged_uri: string;
  prepared_uri: string | null;
  content_type: string | null;
  file_extension: string | null;
  original_size_bytes: number | null;
  final_size_bytes: number | null;
  playback_duration_ms: number | null;
  source_width: number | null;
  source_height: number | null;
  thumbnail_b64: string | null;
  batch_id: string | null;
  asset_id: string | null;
  storage_path: string | null;
  upload_url: string | null;
  upload_headers_json: string | null;
  upload_url_expires_at: number | null;
  finalize_url: string | null;
  finalize_headers_json: string | null;
  finalize_token: string | null;
  progress: number;
  bytes_sent: number;
  bytes_total: number;
  retry_count: number;
  auth_refresh_attempted: number | null;
  next_attempt_at: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
  started_at: number | null;
  finished_at: number | null;
};

type UploadRecipientRow = {
  job_id: string;
  receiver_id: string;
  view_duration_sec: number;
  sequence_index: number;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

function parseHeaders(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return null;
  }
}

async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS upload_queue_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upload_jobs (
      id TEXT PRIMARY KEY NOT NULL,
      idempotency_key TEXT,
      owner_id TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      state TEXT NOT NULL,
      staged_uri TEXT NOT NULL,
      prepared_uri TEXT,
      content_type TEXT,
      file_extension TEXT,
      original_size_bytes INTEGER,
      final_size_bytes INTEGER,
      playback_duration_ms INTEGER,
      source_width INTEGER,
      source_height INTEGER,
      thumbnail_b64 TEXT,
      batch_id TEXT,
      asset_id TEXT,
      storage_path TEXT,
      upload_url TEXT,
      upload_headers_json TEXT,
      upload_url_expires_at INTEGER,
      finalize_url TEXT,
      finalize_headers_json TEXT,
      finalize_token TEXT,
      progress REAL NOT NULL DEFAULT 0,
      bytes_sent INTEGER NOT NULL DEFAULT 0,
      bytes_total INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      auth_refresh_attempted INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      error_code TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_upload_jobs_owner_state
      ON upload_jobs(owner_id, state, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_upload_jobs_next_attempt
      ON upload_jobs(next_attempt_at)
      WHERE state = 'retry_scheduled';
    CREATE INDEX IF NOT EXISTS idx_upload_jobs_expiry
      ON upload_jobs(expires_at)
      WHERE state NOT IN ('completed', 'cancelled', 'expired');

    CREATE TABLE IF NOT EXISTS upload_recipients (
      job_id TEXT NOT NULL REFERENCES upload_jobs(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL,
      view_duration_sec INTEGER NOT NULL,
      sequence_index INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (job_id, receiver_id)
    );
  `);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(upload_jobs)');
  if (!columns.some((column) => column.name === 'idempotency_key')) {
    await db.execAsync('ALTER TABLE upload_jobs ADD COLUMN idempotency_key TEXT;');
  }
  if (!columns.some((column) => column.name === 'auth_refresh_attempted')) {
    await db.execAsync(
      'ALTER TABLE upload_jobs ADD COLUMN auth_refresh_attempted INTEGER NOT NULL DEFAULT 0;'
    );
  }
  await db.runAsync(
    `UPDATE upload_jobs
     SET idempotency_key = id
     WHERE idempotency_key IS NULL OR idempotency_key = ''`
  );
  await db.runAsync(
    `INSERT INTO upload_queue_meta(key, value)
     VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    String(DATABASE_VERSION)
  );
}

export async function getUploadQueueDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await initializeDatabase(db);
      return db;
    });
  }
  return databasePromise;
}

function toJob(row: UploadJobRow, recipients: DurableUploadRecipient[]): DurableUploadJob {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key || row.id,
    ownerId: row.owner_id,
    mediaType: row.media_type,
    state: row.state,
    stagedUri: row.staged_uri,
    preparedUri: row.prepared_uri,
    contentType: row.content_type,
    fileExtension: row.file_extension,
    originalSizeBytes: row.original_size_bytes,
    finalSizeBytes: row.final_size_bytes,
    playbackDurationMs: row.playback_duration_ms,
    sourceWidth: row.source_width,
    sourceHeight: row.source_height,
    thumbnailB64: row.thumbnail_b64,
    batchId: row.batch_id,
    assetId: row.asset_id,
    storagePath: row.storage_path,
    uploadUrl: row.upload_url,
    uploadHeaders: parseHeaders(row.upload_headers_json),
    uploadUrlExpiresAt: row.upload_url_expires_at,
    finalizeUrl: row.finalize_url,
    finalizeHeaders: parseHeaders(row.finalize_headers_json),
    finalizeToken: row.finalize_token,
    progress: row.progress,
    bytesSent: row.bytes_sent,
    bytesTotal: row.bytes_total,
    retryCount: row.retry_count,
    authRefreshAttempted: row.auth_refresh_attempted === 1,
    nextAttemptAt: row.next_attempt_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    recipients,
  };
}

export async function listDurableUploadJobs(ownerId: string): Promise<DurableUploadJob[]> {
  const db = await getUploadQueueDatabase();
  const [rows, recipientRows] = await Promise.all([
    db.getAllAsync<UploadJobRow>(
      `SELECT * FROM upload_jobs
       WHERE owner_id = ?
       ORDER BY created_at DESC`,
      ownerId
    ),
    db.getAllAsync<UploadRecipientRow>(
      `SELECT r.*
       FROM upload_recipients r
       JOIN upload_jobs j ON j.id = r.job_id
       WHERE j.owner_id = ?
       ORDER BY r.sequence_index, r.receiver_id`,
      ownerId
    ),
  ]);
  const recipientsByJob = new Map<string, DurableUploadRecipient[]>();
  for (const row of recipientRows) {
    const recipients = recipientsByJob.get(row.job_id) ?? [];
    recipients.push({
      receiverId: row.receiver_id,
      viewDurationSec: row.view_duration_sec,
      sequenceIndex: row.sequence_index,
    });
    recipientsByJob.set(row.job_id, recipients);
  }
  return rows.map((row) => toJob(row, recipientsByJob.get(row.id) ?? []));
}

export async function getDurableUploadJob(jobId: string): Promise<DurableUploadJob | null> {
  const db = await getUploadQueueDatabase();
  const row = await db.getFirstAsync<UploadJobRow>('SELECT * FROM upload_jobs WHERE id = ?', jobId);
  if (!row) return null;
  const recipientRows = await db.getAllAsync<UploadRecipientRow>(
    'SELECT * FROM upload_recipients WHERE job_id = ? ORDER BY sequence_index, receiver_id',
    jobId
  );
  return toJob(
    row,
    recipientRows.map((recipient) => ({
      receiverId: recipient.receiver_id,
      viewDurationSec: recipient.view_duration_sec,
      sequenceIndex: recipient.sequence_index,
    }))
  );
}

export async function insertDurableUploadJob(job: DurableUploadJob) {
  const db = await getUploadQueueDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO upload_jobs (
        id, idempotency_key, owner_id, media_type, state, staged_uri, prepared_uri, content_type,
        file_extension, original_size_bytes, final_size_bytes, playback_duration_ms,
        source_width, source_height, thumbnail_b64, batch_id, asset_id, storage_path,
        upload_url, upload_headers_json, upload_url_expires_at, finalize_url,
        finalize_headers_json, finalize_token, progress, bytes_sent, bytes_total,
        retry_count, auth_refresh_attempted, next_attempt_at, error_code, error_message, created_at, updated_at,
        expires_at, started_at, finished_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
      job.id,
      job.idempotencyKey,
      job.ownerId,
      job.mediaType,
      job.state,
      job.stagedUri,
      job.preparedUri,
      job.contentType,
      job.fileExtension,
      job.originalSizeBytes,
      job.finalSizeBytes,
      job.playbackDurationMs,
      job.sourceWidth,
      job.sourceHeight,
      job.thumbnailB64,
      job.batchId,
      job.assetId,
      job.storagePath,
      job.uploadUrl,
      job.uploadHeaders ? JSON.stringify(job.uploadHeaders) : null,
      job.uploadUrlExpiresAt,
      job.finalizeUrl,
      job.finalizeHeaders ? JSON.stringify(job.finalizeHeaders) : null,
      job.finalizeToken,
      job.progress,
      job.bytesSent,
      job.bytesTotal,
      job.retryCount,
      job.authRefreshAttempted ? 1 : 0,
      job.nextAttemptAt,
      job.errorCode,
      job.errorMessage,
      job.createdAt,
      job.updatedAt,
      job.expiresAt,
      job.startedAt,
      job.finishedAt
    );
    if (job.recipients.length > 0) {
      const recipientValues: SQLiteBindValue[] = [];
      const recipientPlaceholders = job.recipients.map((recipient) => {
        recipientValues.push(
          job.id,
          recipient.receiverId,
          recipient.viewDurationSec,
          recipient.sequenceIndex
        );
        return '(?, ?, ?, ?)';
      });
      await tx.runAsync(
        `INSERT INTO upload_recipients (
          job_id, receiver_id, view_duration_sec, sequence_index
        ) VALUES ${recipientPlaceholders.join(', ')}`,
        ...recipientValues
      );
    }
  });
}

const fieldToColumn: Record<keyof DurableUploadJob, string | null> = {
  id: null,
  idempotencyKey: 'idempotency_key',
  ownerId: 'owner_id',
  mediaType: 'media_type',
  state: 'state',
  stagedUri: 'staged_uri',
  preparedUri: 'prepared_uri',
  contentType: 'content_type',
  fileExtension: 'file_extension',
  originalSizeBytes: 'original_size_bytes',
  finalSizeBytes: 'final_size_bytes',
  playbackDurationMs: 'playback_duration_ms',
  sourceWidth: 'source_width',
  sourceHeight: 'source_height',
  thumbnailB64: 'thumbnail_b64',
  batchId: 'batch_id',
  assetId: 'asset_id',
  storagePath: 'storage_path',
  uploadUrl: 'upload_url',
  uploadHeaders: 'upload_headers_json',
  uploadUrlExpiresAt: 'upload_url_expires_at',
  finalizeUrl: 'finalize_url',
  finalizeHeaders: 'finalize_headers_json',
  finalizeToken: 'finalize_token',
  progress: 'progress',
  bytesSent: 'bytes_sent',
  bytesTotal: 'bytes_total',
  retryCount: 'retry_count',
  authRefreshAttempted: 'auth_refresh_attempted',
  nextAttemptAt: 'next_attempt_at',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  expiresAt: 'expires_at',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  recipients: null,
};

export async function patchDurableUploadJob(
  jobId: string,
  patch: Partial<Omit<DurableUploadJob, 'id' | 'recipients'>>
) {
  const entries = Object.entries(patch) as [
    keyof DurableUploadJob,
    DurableUploadJob[keyof DurableUploadJob],
  ][];
  const assignments: string[] = [];
  const values: SQLiteBindValue[] = [];
  for (const [field, value] of entries) {
    const column = fieldToColumn[field];
    if (!column) continue;
    assignments.push(`${column} = ?`);
    if (field === 'uploadHeaders' || field === 'finalizeHeaders') {
      values.push(value ? JSON.stringify(value) : null);
    } else if (field === 'authRefreshAttempted') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value as SQLiteBindValue);
    }
  }
  assignments.push('updated_at = ?');
  values.push(Date.now(), jobId);
  const db = await getUploadQueueDatabase();
  await db.runAsync(
    `UPDATE upload_jobs SET ${assignments.join(', ')} WHERE id = ?`,
    ...values
  );
}

export async function purgeExpiredDurableUploadJobs(now = Date.now()) {
  const db = await getUploadQueueDatabase();
  const rows = await db.getAllAsync<{ id: string; staged_uri: string }>(
    `SELECT id, staged_uri
     FROM upload_jobs
     WHERE expires_at <= ?
       AND state NOT IN ('completed', 'cancelled', 'expired')`,
    now
  );
  await db.runAsync(
    `UPDATE upload_jobs
     SET state = 'expired', updated_at = ?, finished_at = ?
     WHERE expires_at <= ?
       AND state NOT IN ('completed', 'cancelled', 'expired')`,
    now,
    now,
    now
  );
  return rows;
}

export async function purgeOwnerDurableUploadJobs(ownerId: string) {
  const db = await getUploadQueueDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM upload_jobs WHERE owner_id = ?',
    ownerId
  );
  await db.runAsync('DELETE FROM upload_jobs WHERE owner_id = ?', ownerId);
  return rows.map((row) => row.id);
}
