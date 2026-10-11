import {
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DomainError } from './errors';
import { sendTextMessage } from './textMessageService';
import { recordProductEvent } from './productAnalyticsService';
import { isTerminalTextOutboxCode, textOutboxBackoffMs } from '../lib/textOutboxPolicy';
import { accountEncryptionKeys, AccountStorageCancelledError } from '../lib/accountEncryptionKeys';
import { createOwnerOperations } from '../lib/ownerOperations';
import { captureAccountTransport } from '../lib/supabase';
import { captureSessionScope, SessionScopeCancelledError } from '../lib/sessionScope';

const DATABASE_NAME = 'nix-text-outbox.db';
const KEY_PREFIX = 'nix.text-outbox.key.v1';
const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;
/** How long the content-free „not sent — expired” marker stays visible in the chat. */
const TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Expired rows are stored as `state = 'failed'` + this error code: the table's CHECK constraint
 * predates the `expired` state and SQLite cannot alter it without rebuilding the table.
 */
const EXPIRED_ERROR_CODE = 'EXPIRED';

/**
 * `expired` is a tombstone (audit OFF-4): after the 24 h content TTL the message body is wiped,
 * but the row stays (only the encrypted receiver is kept) so the chat can say „not sent — expired”
 * instead of the message silently vanishing. The user removes it, or it is purged after 7 days.
 */
export type TextOutboxState = 'pending' | 'sending' | 'failed' | 'expired';

export type TextOutboxJob = {
  id: string;
  ownerId: string;
  receiverId: string;
  body: string;
  state: TextOutboxState;
  attemptCount: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  errorCode: string | null;
};

type OutboxPayload = { receiverId: string; body: string };
type OutboxRow = {
  id: string;
  owner_id: string;
  encrypted_payload: string;
  state: Exclude<TextOutboxState, 'expired'>;
  attempt_count: number;
  next_attempt_at: number;
  created_at: number;
  updated_at: number;
  expires_at: number;
  error_code: string | null;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;
const operations = createOwnerOperations();
type FlushRun = { promise: Promise<string[]>; cancellation: AbortController; rerun: boolean };
const flushes = new Map<string, FlushRun>();

async function database() {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS text_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL,
          encrypted_payload TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'failed')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          error_code TEXT
        );
        CREATE INDEX IF NOT EXISTS text_outbox_owner_due
          ON text_outbox(owner_id, next_attempt_at, created_at);
      `);
      await db.runAsync(
        `UPDATE text_outbox SET state = 'pending'
         WHERE state = 'sending'`
      );
      return db;
    });
  }
  return databasePromise;
}

function keyName(ownerId: string) {
  return `${KEY_PREFIX}.${ownerId}`;
}

async function encryptionKey(ownerId: string) {
  return accountEncryptionKeys.get(keyName(ownerId));
}

async function encryptPayload(ownerId: string, payload: OutboxPayload) {
  const key = await encryptionKey(ownerId);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = await aesEncryptAsync(plaintext, key);
  return sealed.combined('base64');
}

async function decryptPayload(ownerId: string, combined: string): Promise<OutboxPayload> {
  const key = await encryptionKey(ownerId);
  const sealed = AESSealedData.fromCombined(combined);
  const plaintext = await aesDecryptAsync(sealed, key);
  const bytes = typeof plaintext === 'string' ? Uint8Array.from(atob(plaintext), (c) => c.charCodeAt(0)) : plaintext;
  return JSON.parse(new TextDecoder().decode(bytes)) as OutboxPayload;
}

function toJob(row: OutboxRow, payload: OutboxPayload): TextOutboxJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    receiverId: payload.receiverId,
    body: payload.body,
    state: row.error_code === EXPIRED_ERROR_CODE ? 'expired' : row.state,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    errorCode: row.error_code,
  };
}

export async function enqueueTextOutbox(
  ownerId: string,
  receiverId: string,
  body: string,
  clientMessageId: string
) {
  const scope = captureSessionScope(ownerId);
  return operations.run(ownerId, async (assertActive) => {
  const db = await database();
  assertActive();
  scope.assertActive();
  const now = Date.now();
  const encrypted = await encryptPayload(ownerId, { receiverId, body });
  assertActive();
  scope.assertActive();
  await db.runAsync(
    `INSERT INTO text_outbox(
      id, owner_id, encrypted_payload, state, attempt_count, next_attempt_at,
      created_at, updated_at, expires_at, error_code
    ) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?, NULL)
    ON CONFLICT(id) DO NOTHING`,
    clientMessageId,
    ownerId,
    encrypted,
    now,
    now,
    now,
    now + OUTBOX_TTL_MS
  );
  });
}

/**
 * Applies the 24 h content TTL. Other owners' expired rows are deleted (their key is not loaded);
 * the current owner's are re-sealed without the body and kept as tombstones for a while.
 */
async function expireOutboxContent(db: SQLiteDatabase, ownerId: string, assertActive: () => void) {
  const now = Date.now();
  await db.runAsync('DELETE FROM text_outbox WHERE owner_id != ? AND expires_at <= ?', ownerId, now);
  await db.runAsync(
    'DELETE FROM text_outbox WHERE owner_id = ? AND error_code = ? AND expires_at <= ?',
    ownerId,
    EXPIRED_ERROR_CODE,
    now - TOMBSTONE_RETENTION_MS
  );
  const expired = await db.getAllAsync<OutboxRow>(
    `SELECT * FROM text_outbox
     WHERE owner_id = ? AND expires_at <= ? AND (error_code IS NULL OR error_code != ?)`,
    ownerId,
    now,
    EXPIRED_ERROR_CODE
  );
  assertActive();
  for (const row of expired) {
    try {
      const { receiverId } = await decryptPayload(ownerId, row.encrypted_payload);
      const tombstone = await encryptPayload(ownerId, { receiverId, body: '' });
      assertActive();
      await db.runAsync(
        `UPDATE text_outbox
         SET encrypted_payload = ?, state = 'failed', error_code = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
        tombstone,
        EXPIRED_ERROR_CODE,
        Date.now(),
        row.id,
        ownerId
      );
    } catch (error) {
      if (error instanceof AccountStorageCancelledError) throw error;
      assertActive();
      await db.runAsync('DELETE FROM text_outbox WHERE id = ? AND owner_id = ?', row.id, ownerId);
    }
  }
}

export async function listTextOutbox(
  ownerId: string,
  receiverId?: string,
  { includeExpired = false }: { includeExpired?: boolean } = {}
) {
  return operations.run(ownerId, async (assertActive) => {
  const db = await database();
  assertActive();
  await expireOutboxContent(db, ownerId, assertActive);
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT * FROM text_outbox WHERE owner_id = ? ORDER BY created_at ASC',
    ownerId
  );
  assertActive();
  const jobs = await Promise.all(
    rows.map(async (row) => {
      try {
        const payload = await decryptPayload(ownerId, row.encrypted_payload);
        assertActive();
        return toJob(row, payload);
      } catch (error) {
        if (error instanceof AccountStorageCancelledError) throw error;
        assertActive();
        await db.runAsync('DELETE FROM text_outbox WHERE id = ? AND owner_id = ?', row.id, ownerId);
        return null;
      }
    })
  );
  assertActive();
  return jobs.filter(
    (job): job is TextOutboxJob =>
      Boolean(
        job
        && (!receiverId || job.receiverId === receiverId)
        && (includeExpired || job.state !== 'expired')
      )
  );
  });
}

export async function deleteTextOutboxJob(ownerId: string, jobId: string) {
  return operations.run(ownerId, async (assertActive) => {
    const db = await database();
    assertActive();
    await db.runAsync('DELETE FROM text_outbox WHERE id = ? AND owner_id = ?', jobId, ownerId);
  });
}

/**
 * Removes a queued text unless a flush has already claimed it for sending,
 * so a removed row can never be enqueued afterwards.
 */
export async function deleteUnclaimedTextOutboxJob(ownerId: string, jobId: string): Promise<boolean> {
  return operations.run(ownerId, async (assertActive) => {
    const db = await database();
    assertActive();
    const result = await db.runAsync(
      "DELETE FROM text_outbox WHERE id = ? AND owner_id = ? AND state IN ('pending', 'failed')",
      jobId,
      ownerId
    );
    return result.changes > 0;
  });
}

export async function retryTextOutboxJob(ownerId: string, jobId: string) {
  return operations.run(ownerId, async (assertActive) => {
    const db = await database();
    assertActive();
    const now = Date.now();
    // A tombstone has no body left to send, and an expired row must not be revived.
    const result = await db.runAsync(
      `UPDATE text_outbox
       SET state = 'pending', next_attempt_at = ?, error_code = NULL, updated_at = ?
       WHERE id = ? AND owner_id = ? AND expires_at > ? AND (error_code IS NULL OR error_code != ?)`,
      now,
      now,
      jobId,
      ownerId,
      now,
      EXPIRED_ERROR_CODE
    );
    if (result.changes) void recordProductEvent('text_outbox_retry', { source: 'manual' });
  });
}

export function clearTextOutbox(ownerId: string) {
  flushes.get(ownerId)?.cancellation.abort();
  return operations.clear(ownerId, async () => {
    try {
      const db = await database();
      await db.runAsync('DELETE FROM text_outbox WHERE owner_id = ?', ownerId);
    } finally { await accountEncryptionKeys.clear(keyName(ownerId)); }
  });
}

function isTerminal(error: unknown) {
  return error instanceof DomainError && isTerminalTextOutboxCode(error.code);
}

export function flushTextOutbox(ownerId: string): Promise<string[]> {
  const existing = flushes.get(ownerId);
  if (existing) {
    // The running pass listed its jobs before this call; ask it for one more pass so a message
    // queued meanwhile is sent by the same promise instead of waiting for the next timer tick.
    existing.rerun = true;
    return existing.promise;
  }
  const run: FlushRun = { promise: Promise.resolve([]), cancellation: new AbortController(), rerun: false };
  const promise = (async () => {
    const sentIds: string[] = [];
    do {
      run.rerun = false;
      sentIds.push(...(await flushOwner(ownerId, run.cancellation.signal)));
    } while (run.rerun && !run.cancellation.signal.aborted);
    return sentIds;
  })().finally(() => {
    if (flushes.get(ownerId) === run) flushes.delete(ownerId);
  });
  run.promise = promise;
  flushes.set(ownerId, run);
  return promise;
}

/**
 * Backoff only protects the server while a request keeps failing. Once connectivity is back (or the
 * app returns to the foreground) pending messages should go out now, not after up to 15 minutes.
 */
export async function resetTextOutboxBackoff(ownerId: string) {
  const db = await database();
  await db.runAsync(
    // A rate limit keeps its backoff: reconnecting does not make the server accept more.
    `UPDATE text_outbox SET next_attempt_at = ?
     WHERE owner_id = ? AND state = 'pending' AND next_attempt_at > ?
       AND (error_code IS NULL OR error_code != 'RATE_LIMITED')`,
    Date.now(),
    ownerId,
    Date.now()
  );
}

async function flushOwner(ownerId: string, signal: AbortSignal) {
  const transport = await captureAccountTransport(ownerId, signal);
  const db = await database();
  transport.assertActive();
  const now = Date.now();
  // listTextOutbox applies the content TTL before anything is sent.
  const jobs = (await listTextOutbox(ownerId)).filter(
    (job) => (job.state === 'pending' || job.state === 'sending') && job.nextAttemptAt <= now
  );
  transport.assertActive();
  const sentIds: string[] = [];
  for (const job of jobs) {
    transport.assertActive();
    const claimed = await db.runAsync(
      `UPDATE text_outbox SET state = 'sending', updated_at = ? WHERE id = ? AND owner_id = ? AND state = 'pending' AND expires_at > ?`,
      Date.now(),
      job.id,
      ownerId,
      Date.now()
    );
    transport.assertActive();
    if (!claimed.changes) continue;
    try {
      await sendTextMessage({
        receiverId: job.receiverId,
        body: job.body,
        clientMessageId: job.id,
        transport,
      });
      transport.assertActive();
      await db.runAsync('DELETE FROM text_outbox WHERE id = ? AND owner_id = ?', job.id, ownerId);
      sentIds.push(job.id);
    } catch (error) {
      if (error instanceof SessionScopeCancelledError || signal.aborted) break;
      transport.assertActive();
      const attemptCount = job.attemptCount + 1;
      const terminal = isTerminal(error);
      const errorCode = error instanceof DomainError ? error.code : 'NETWORK';
      const backoff = textOutboxBackoffMs(attemptCount, errorCode);
      await db.runAsync(
        `UPDATE text_outbox
         SET state = ?, attempt_count = ?, next_attempt_at = ?, error_code = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
        terminal ? 'failed' : 'pending',
        attemptCount,
        Date.now() + backoff,
        errorCode,
        Date.now(),
        job.id,
        ownerId
      );
    }
  }
  return sentIds;
}
