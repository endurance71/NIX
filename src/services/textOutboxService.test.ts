import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTextOutbox,
  deleteTextOutboxJob,
  enqueueTextOutbox,
  flushTextOutbox,
  listTextOutbox,
  resetTextOutboxBackoff,
  retryTextOutboxJob,
} from './textOutboxService';
import { setSessionOwner } from '../lib/sessionScope';
import { DomainError } from './errors';

const { rows, send, tokens } = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), send: vi.fn(), tokens: { current: 'jwt-a' } }));
vi.mock('expo-crypto', () => ({
  AESSealedData: { fromCombined: (value: string) => value },
  AESEncryptionKey: { generate: async () => ({ encoded: async () => 'key' }), import: async () => ({}) },
  AESKeySize: { AES256: 256 },
  aesEncryptAsync: async (bytes: Uint8Array) => ({ combined: async () => Buffer.from(bytes).toString('base64') }),
  aesDecryptAsync: async (value: string) => new Uint8Array(Buffer.from(value, 'base64')),
}));
vi.mock('expo-secure-store', () => ({ AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock('./productAnalyticsService', () => ({ recordProductEvent: vi.fn() }));
vi.mock('./textMessageService', () => ({ sendTextMessage: send }));
vi.mock('../lib/supabase', async () => {
  const { captureSessionScope } = await import('../lib/sessionScope');
  return { captureAccountTransport: async (owner: string, cancellation: AbortSignal) => {
    const scope = captureSessionScope(owner);
    const token = tokens.current;
    return { ...scope, token, signal: cancellation, assertActive() { scope.assertActive(); if (cancellation.aborted) throw new Error('Cancelled'); } };
  } };
});
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async () => {},
  getAllAsync: async (sql: string, owner: string, now?: number, expiredCode?: string) => [...rows.values()]
    .filter((row) => row.owner_id === owner)
    .filter((row) => !sql.includes('expires_at <= ?') || (Number(row.expires_at) <= Number(now) && row.error_code !== expiredCode))
    .map((row) => ({ ...row })),
  runAsync: async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const [id, owner, payload, due, created, updated, expires] = args;
      rows.set(String(id), { id, owner_id: owner, encrypted_payload: payload, state: 'pending', attempt_count: 0, next_attempt_at: due, created_at: created, updated_at: updated, expires_at: expires, error_code: null });
    } else if (sql.includes('WHERE owner_id != ? AND expires_at <= ?')) {
      for (const [id, row] of rows) if (row.owner_id !== args[0] && Number(row.expires_at) <= Number(args[1])) rows.delete(id);
    } else if (sql.includes('WHERE owner_id = ? AND error_code = ? AND expires_at <= ?')) {
      for (const [id, row] of rows) {
        if (row.owner_id === args[0] && row.error_code === args[1] && Number(row.expires_at) <= Number(args[2])) rows.delete(id);
      }
    } else if (sql.startsWith('DELETE') && sql.includes('WHERE id = ? AND owner_id = ?')) {
      if (rows.get(String(args[0]))?.owner_id === args[1]) rows.delete(String(args[0]));
    } else if (sql.startsWith('DELETE') && sql.includes('WHERE owner_id = ?')) {
      for (const [id, row] of rows) if (row.owner_id === args[0]) rows.delete(id);
    } else if (sql.includes('SET encrypted_payload = ?')) {
      const row = rows.get(String(args[3]));
      if (row && row.owner_id === args[4]) Object.assign(row, { encrypted_payload: args[0], state: 'failed', error_code: args[1], updated_at: args[2] });
    } else if (sql.includes("SET state = 'sending'")) {
      const row = rows.get(String(args[1]));
      if (!row || row.owner_id !== args[2] || row.state !== 'pending' || Number(row.expires_at) <= Number(args[3])) return { changes: 0 };
      row.state = 'sending';
    } else if (sql.includes("SET state = 'pending', next_attempt_at = ?")) {
      const row = rows.get(String(args[2]));
      if (!row || row.owner_id !== args[3] || Number(row.expires_at) <= Number(args[4]) || row.error_code === args[5]) return { changes: 0 };
      Object.assign(row, { state: 'pending', next_attempt_at: args[0], error_code: null, updated_at: args[1] });
    } else if (sql.includes('SET next_attempt_at = ?')) {
      for (const row of rows.values()) {
        if (row.owner_id === args[1] && row.state === 'pending' && Number(row.next_attempt_at) > Number(args[2]) && row.error_code !== 'RATE_LIMITED') row.next_attempt_at = args[0];
      }
    } else if (sql.includes('SET state = ?')) {
      const row = rows.get(String(args[5]));
      if (row && row.owner_id === args[6]) Object.assign(row, { state: args[0], attempt_count: args[1], next_attempt_at: args[2], error_code: args[3], updated_at: args[4] });
    } else if (sql.includes("WHERE state = 'sending'")) {
      for (const row of rows.values()) if (row.state === 'sending') row.state = 'pending';
    } else {
      throw new Error(`Unexpected SQL in test mock: ${sql}`);
    }
    return { changes: 1 };
  },
}) }));

describe('owner-scoped text outbox races', () => {
  beforeEach(() => { rows.clear(); send.mockReset(); setSessionOwner('a'); tokens.current = 'jwt-a'; });

  it('shares one flush and sends each claimed message once with one captured JWT', async () => {
    await enqueueTextOutbox('a', 'peer', 'one', 'one');
    await enqueueTextOutbox('a', 'peer', 'two', 'two');
    const capturedTokens: string[] = [];
    send.mockImplementation(async ({ transport }) => { transport.assertActive(); capturedTokens.push(transport.token); tokens.current = 'refreshed-token'; });
    const first = flushTextOutbox('a'), second = flushTextOutbox('a');
    expect(first).toBe(second);
    expect(await first).toEqual(['one', 'two']);
    expect(capturedTokens).toEqual(['jwt-a', 'jwt-a']);
    expect(send).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(0);
  });

  it('cannot send a second A job after clear/logout/login B while the first request is paused', async () => {
    await enqueueTextOutbox('a', 'peer', 'private one', 'one');
    await enqueueTextOutbox('a', 'peer', 'private two', 'two');
    let release!: () => void;
    send.mockImplementation(async ({ transport }) => {
      transport.assertActive(); await new Promise<void>((resolve) => { release = resolve; }); transport.assertActive();
    });
    const flush = flushTextOutbox('a');
    await vi.waitFor(() => expect(release).toBeDefined());
    const cleared = clearTextOutbox('a');
    setSessionOwner(null); setSessionOwner('b'); tokens.current = 'jwt-b';
    release(); await cleared; await flush;
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].transport.token).toBe('jwt-a');
    expect(rows.size).toBe(0);
    await expect(enqueueTextOutbox('a', 'peer', 'late stale owner', 'late')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('sends a message queued during an in-flight flush within the same flush promise', async () => {
    await enqueueTextOutbox('a', 'peer', 'old', 'old');
    let release!: () => void;
    send.mockImplementationOnce(async () => { await new Promise<void>((resolve) => { release = resolve; }); });
    const running = flushTextOutbox('a');
    await vi.waitFor(() => expect(release).toBeDefined());
    await enqueueTextOutbox('a', 'peer', 'new', 'new');
    const joined = flushTextOutbox('a');
    release();
    expect(await joined).toEqual(['old', 'new']);
    expect(await running).toEqual(['old', 'new']);
    expect(rows.size).toBe(0);
  });

  it('retries a backed-off message immediately once connectivity is back', async () => {
    await enqueueTextOutbox('a', 'peer', 'offline', 'one');
    send.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await flushTextOutbox('a')).toEqual([]);
    expect((await listTextOutbox('a'))[0].nextAttemptAt).toBeGreaterThan(Date.now());
    expect(await flushTextOutbox('a')).toEqual([]);
    await resetTextOutboxBackoff('a');
    expect(await flushTextOutbox('a')).toEqual(['one']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('CONTENT_NOT_ALLOWED is terminal and a later automatic flush does not retry', async () => {
    await enqueueTextOutbox('a', 'peer', 'blocked', 'one');
    send.mockRejectedValue(new DomainError('CONTENT_NOT_ALLOWED', 'Blocked'));
    expect(await flushTextOutbox('a')).toEqual([]);
    expect((await listTextOutbox('a'))[0]).toMatchObject({ state: 'failed', errorCode: 'CONTENT_NOT_ALLOWED' });
    await flushTextOutbox('a');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('RATE_LIMITED is retried automatically with at least a one-minute backoff', async () => {
    await enqueueTextOutbox('a', 'peer', 'slow down', 'one');
    send.mockRejectedValueOnce(new DomainError('RATE_LIMITED', 'Too many'));
    const before = Date.now();
    expect(await flushTextOutbox('a')).toEqual([]);
    const [job] = await listTextOutbox('a');
    expect(job).toMatchObject({ state: 'pending', errorCode: 'RATE_LIMITED' });
    expect(job.nextAttemptAt).toBeGreaterThanOrEqual(before + 60_000);
    // Reconnecting does not lift a server rate limit.
    await resetTextOutboxBackoff('a');
    expect((await listTextOutbox('a'))[0].nextAttemptAt).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('UNAUTHORIZED stays terminal', async () => {
    await enqueueTextOutbox('a', 'peer', 'who am i', 'one');
    send.mockRejectedValueOnce(new DomainError('UNAUTHORIZED', 'Session'));
    await flushTextOutbox('a');
    expect((await listTextOutbox('a'))[0]).toMatchObject({ state: 'failed', errorCode: 'UNAUTHORIZED' });
  });

  it('turns an expired message into a body-less tombstone instead of deleting it', async () => {
    await enqueueTextOutbox('a', 'peer', 'secret content', 'one');
    rows.get('one')!.expires_at = Date.now() - 1;
    expect(await listTextOutbox('a')).toEqual([]);
    const [tombstone] = await listTextOutbox('a', 'peer', { includeExpired: true });
    expect(tombstone).toMatchObject({ id: 'one', receiverId: 'peer', body: '', state: 'expired' });
    expect(Buffer.from(String(rows.get('one')!.encrypted_payload), 'base64').toString()).not.toContain('secret');
    expect(await flushTextOutbox('a')).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    await retryTextOutboxJob('a', 'one');
    expect((await listTextOutbox('a', 'peer', { includeExpired: true }))[0].state).toBe('expired');
  });

  it('purges tombstones after the retention window and drops other owners\' expired rows', async () => {
    await enqueueTextOutbox('a', 'peer', 'old', 'old');
    rows.get('old')!.expires_at = Date.now() - 8 * 24 * 60 * 60 * 1000;
    rows.set('foreign', { ...rows.get('old')!, id: 'foreign', owner_id: 'b', error_code: null });
    await listTextOutbox('a', 'peer', { includeExpired: true });
    expect(rows.has('foreign')).toBe(false);
    expect(rows.get('old')?.error_code).toBe('EXPIRED');
    await listTextOutbox('a', 'peer', { includeExpired: true });
    expect(rows.has('old')).toBe(false);
  });

  it('delete and retry only touch the owner\'s rows', async () => {
    await enqueueTextOutbox('a', 'peer', 'mine', 'one');
    rows.get('one')!.state = 'failed';
    setSessionOwner(null); setSessionOwner('b');
    await deleteTextOutboxJob('b', 'one');
    await retryTextOutboxJob('b', 'one');
    expect(rows.get('one')).toMatchObject({ owner_id: 'a', state: 'failed' });
    setSessionOwner(null); setSessionOwner('a');
    await retryTextOutboxJob('a', 'one');
    expect(rows.get('one')?.state).toBe('pending');
    await deleteTextOutboxJob('a', 'one');
    expect(rows.has('one')).toBe(false);
  });
});
