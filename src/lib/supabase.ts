import './installUrlPolyfill';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { authStorage } from './authStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Brak EXPO_PUBLIC_SUPABASE_URL lub EXPO_PUBLIC_SUPABASE_ANON_KEY. Ustaw zmienne w .env albo sekretach EAS.'
  );
}

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    lock: processLock,
  },
});

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
