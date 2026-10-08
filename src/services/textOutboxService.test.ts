import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTextOutbox, enqueueTextOutbox, flushTextOutbox, listTextOutbox } from './textOutboxService';
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
  getAllAsync: async (_sql: string, owner: string) => [...rows.values()].filter((row) => row.owner_id === owner).map((row) => ({ ...row })),
  runAsync: async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith('INSERT')) {
      const [id, owner, payload, due, created, updated, expires] = args;
      rows.set(String(id), { id, owner_id: owner, encrypted_payload: payload, state: 'pending', attempt_count: 0, next_attempt_at: due, created_at: created, updated_at: updated, expires_at: expires, error_code: null });
    } else if (sql.startsWith('DELETE') && sql.includes('owner_id')) {
      for (const [id, row] of rows) if (row.owner_id === args[0]) rows.delete(id);
    } else if (sql.startsWith('DELETE') && sql.includes('expires_at')) {
      for (const [id, row] of rows) if (Number(row.expires_at) <= Number(args[0])) rows.delete(id);
    } else if (sql.startsWith('DELETE')) rows.delete(String(args[0]));
    else if (sql.includes("SET state = 'sending'")) {
      const row = rows.get(String(args[1]));
      if (!row || row.owner_id !== args[2] || row.state !== 'pending' || Number(row.expires_at) <= Number(args[3])) return { changes: 0 };
      row.state = 'sending';
    } else if (sql.includes('SET state = ?')) {
      const row = rows.get(String(args[5]));
      if (row) Object.assign(row, { state: args[0], attempt_count: args[1], next_attempt_at: args[2], error_code: args[3], updated_at: args[4] });
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

  it('CONTENT_NOT_ALLOWED is terminal and a later automatic flush does not retry', async () => {
    await enqueueTextOutbox('a', 'peer', 'blocked', 'one');
    send.mockRejectedValue(new DomainError('CONTENT_NOT_ALLOWED', 'Blocked'));
    expect(await flushTextOutbox('a')).toEqual([]);
    expect((await listTextOutbox('a'))[0]).toMatchObject({ state: 'failed', errorCode: 'CONTENT_NOT_ALLOWED' });
    await flushTextOutbox('a');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
