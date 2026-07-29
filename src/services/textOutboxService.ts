import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DomainError } from './errors';
import { sendTextMessage } from './textMessageService';
import { recordProductEvent } from './productAnalyticsService';
import { isTerminalTextOutboxCode, textOutboxBackoffMs } from '../lib/textOutboxPolicy';

const DATABASE_NAME = 'nix-text-outbox.db';
const KEY_PREFIX = 'nix.text-outbox.key.v1';
const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;

export type TextOutboxState = 'pending' | 'sending' | 'failed';

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
  state: TextOutboxState;
  attempt_count: number;
  next_attempt_at: number;
  created_at: number;
  updated_at: number;
  expires_at: number;
  error_code: string | null;
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

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
  const stored = await SecureStore.getItemAsync(keyName(ownerId));
  if (stored) return AESEncryptionKey.import(stored, 'base64');
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(keyName(ownerId), await key.encoded('base64'));
  return key;
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
    state: row.state,
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
  const db = await database();
  const now = Date.now();
  const encrypted = await encryptPayload(ownerId, { receiverId, body });
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
}

export async function listTextOutbox(ownerId: string, receiverId?: string) {
  const db = await database();
  await db.runAsync('DELETE FROM text_outbox WHERE expires_at <= ?', Date.now());
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT * FROM text_outbox WHERE owner_id = ? ORDER BY created_at ASC',
    ownerId
  );
  const jobs = await Promise.all(
    rows.map(async (row) => {
      try {
        return toJob(row, await decryptPayload(ownerId, row.encrypted_payload));
      } catch {
        await db.runAsync('DELETE FROM text_outbox WHERE id = ?', row.id);
        return null;
      }
    })
  );
  return jobs.filter(
    (job): job is TextOutboxJob => Boolean(job && (!receiverId || job.receiverId === receiverId))
  );
}

export async function deleteTextOutboxJob(jobId: string) {
  const db = await database();
  await db.runAsync('DELETE FROM text_outbox WHERE id = ?', jobId);
}

export async function retryTextOutboxJob(jobId: string) {
  const db = await database();
  await db.runAsync(
    `UPDATE text_outbox
     SET state = 'pending', next_attempt_at = ?, error_code = NULL, updated_at = ?
     WHERE id = ?`,
    Date.now(),
    Date.now(),
    jobId
  );
  void recordProductEvent('text_outbox_retry', { source: 'manual' });
}

export async function clearTextOutbox(ownerId: string) {
  const db = await database();
  await db.runAsync('DELETE FROM text_outbox WHERE owner_id = ?', ownerId);
  await SecureStore.deleteItemAsync(keyName(ownerId));
}

function isTerminal(error: unknown) {
  return error instanceof DomainError && isTerminalTextOutboxCode(error.code);
}

export async function flushTextOutbox(ownerId: string) {
  const db = await database();
  const now = Date.now();
  await db.runAsync('DELETE FROM text_outbox WHERE expires_at <= ?', now);
  const jobs = (await listTextOutbox(ownerId)).filter(
    (job) => job.state !== 'failed' && job.nextAttemptAt <= now
  );
  const sentIds: string[] = [];
  for (const job of jobs) {
    await db.runAsync(
      `UPDATE text_outbox SET state = 'sending', updated_at = ? WHERE id = ?`,
      Date.now(),
      job.id
    );
    try {
      await sendTextMessage({
        receiverId: job.receiverId,
        body: job.body,
        clientMessageId: job.id,
      });
      await deleteTextOutboxJob(job.id);
      sentIds.push(job.id);
    } catch (error) {
      const attemptCount = job.attemptCount + 1;
      const terminal = isTerminal(error);
      const backoff = textOutboxBackoffMs(attemptCount);
      await db.runAsync(
        `UPDATE text_outbox
         SET state = ?, attempt_count = ?, next_attempt_at = ?, error_code = ?, updated_at = ?
         WHERE id = ?`,
        terminal ? 'failed' : 'pending',
        attemptCount,
        Date.now() + backoff,
        error instanceof DomainError ? error.code : 'NETWORK',
        Date.now(),
        job.id
      );
    }
  }
  return sentIds;
}
