import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearUserCache } from '../services/profileService';
import {
  signInWithPassword as requestPasswordSignIn,
  signUpWithPassword as requestPasswordSignUp,
  requestPasswordReset as requestPasswordResetEmail,
  updatePassword as requestPasswordUpdate,
  signOut as requestSignOut,
} from '../services/authService';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const authBootstrapTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    // Fetch current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(authBootstrapTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await requestPasswordSignIn(email, password);
    return { data, error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await requestPasswordSignUp(email, password);
    return { data, error };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { data, error } = await requestPasswordResetEmail(email);
    return { data, error };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { data, error } = await requestPasswordUpdate(password);
    return { data, error };
  }, []);

  const logout = useCallback(async () => {
    clearUserCache();
    const { error } = await requestSignOut();
    return { error };
  }, []);

  return {
    session,
    user,
    loading,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut: logout,
  };
}
