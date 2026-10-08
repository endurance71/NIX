import './installUrlPolyfill';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { authStorage } from './authStorage';
import type { Database } from '../types/database.generated';
import { captureSessionScope, sessionGeneration, SessionScopeCancelledError } from './sessionScope';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!configuredUrl || !configuredAnonKey) {
  throw new Error(
    'Brak EXPO_PUBLIC_SUPABASE_URL lub EXPO_PUBLIC_SUPABASE_ANON_KEY. Ustaw zmienne w .env albo sekretach EAS.'
  );
}
const supabaseUrl: string = configuredUrl;
const supabaseAnonKey: string = configuredAnonKey;

function getSupabaseProjectRef(url: string): string {
  try {
    const projectRef = new URL(url).hostname.split('.')[0];
    if (!projectRef) throw new Error('Missing Supabase project reference');
    return projectRef;
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL nie jest prawidłowym adresem URL.');
  }
}

export const SUPABASE_AUTH_STORAGE_KEY = `sb-${getSupabaseProjectRef(supabaseUrl)}-auth-token`;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    lock: processLock,
  },
});

export type AccountTransport = Awaited<ReturnType<typeof captureAccountTransport>>;

/** A stateless client always uses the captured JWT, including moderation polling. */
export async function captureAccountTransport(expectedOwner?: string, cancellation?: AbortSignal) {
  const generation = sessionGeneration();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session || (expectedOwner && session.user.id !== expectedOwner)) {
    throw new Error('Authenticated account required');
  }
  const scope = captureSessionScope(session.user.id, generation);
  const assertActive = () => {
    scope.assertActive();
    if (cancellation?.aborted) throw new SessionScopeCancelledError();
  };
  const token = session.access_token;
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => { assertActive(); return token; },
    global: {
      fetch: async (input, init) => {
        assertActive();
        const controller = new AbortController();
        const abort = () => controller.abort();
        const requestSignal = init?.signal;
        scope.signal.addEventListener('abort', abort, { once: true });
        cancellation?.addEventListener('abort', abort, { once: true });
        requestSignal?.addEventListener('abort', abort, { once: true });
        if (requestSignal?.aborted) abort();
        try {
          const result = await fetch(input, { ...init, signal: controller.signal });
          assertActive();
          return result;
        } finally {
          scope.signal.removeEventListener('abort', abort);
          cancellation?.removeEventListener('abort', abort);
          requestSignal?.removeEventListener('abort', abort);
        }
      },
    },
  });
  return { ...scope, signal: cancellation ?? scope.signal, assertActive, token, client };
}

let authLifecycleBound = false;

export function bindSupabaseAuthLifecycle(): () => void {
  if (authLifecycleBound || Platform.OS === 'web') return () => {};
  authLifecycleBound = true;

  const syncRefresh = (state: string) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  };
  syncRefresh(AppState.currentState);
  const subscription = AppState.addEventListener('change', syncRefresh);
  return () => {
    subscription.remove();
    authLifecycleBound = false;
  };
}
