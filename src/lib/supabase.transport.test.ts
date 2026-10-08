import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAccountTransport } from './supabase';
import { setSessionOwner } from './sessionScope';

const { getSession, clients } = vi.hoisted(() => ({ getSession: vi.fn(), clients: [] as { accessToken?: () => Promise<string>; global?: { fetch: typeof fetch } }[] }));
vi.mock('react-native', () => ({ AppState: {}, Platform: { OS: 'ios' } }));
vi.mock('./authStorage', () => ({ authStorage: {} }));
vi.mock('./installUrlPolyfill', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ processLock: {}, createClient: (_url: string, _key: string, options: { accessToken?: () => Promise<string>; global?: { fetch: typeof fetch } }) => {
  clients.push(options); return { auth: { getSession } };
} }));

describe('immutable account transport', () => {
  beforeEach(() => { getSession.mockReset(); setSessionOwner('a'); getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'jwt-a' } }, error: null }); });

  it('keeps its JWT across refreshes and blocks all requests after switching account', async () => {
    const transport = await captureAccountTransport('a');
    const options = clients.at(-1)!;
    getSession.mockResolvedValue({ data: { session: { user: { id: 'b' }, access_token: 'jwt-b' } }, error: null });
    expect(await options.accessToken?.()).toBe('jwt-a');
    setSessionOwner('b');
    await expect(options.accessToken?.()).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => transport.assertActive()).toThrow('Account session changed');
  });

  it('checks generation after getSession resolves instead of attaching old work to a new login', async () => {
    let release!: (value: unknown) => void;
    getSession.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = captureAccountTransport('a');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    setSessionOwner(null); setSessionOwner('a');
    release({ data: { session: { user: { id: 'a' }, access_token: 'new-login-a' } }, error: null });
    await rejected;
  });

  it('aborts an in-flight fetch on logout and rejects a late response', async () => {
    let release!: (value: Response) => void;
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((_input, init) => { requestSignal = init.signal; return new Promise((resolve) => { release = resolve; }); }));
    await captureAccountTransport('a');
    const pending = clients.at(-1)!.global!.fetch('https://test.supabase.co/rest/v1/nixes');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    setSessionOwner(null);
    expect(requestSignal?.aborted).toBe(true);
    release(new Response('{}')); await rejected;
    vi.unstubAllGlobals();
  });
});
