import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { getCurrentLocale } from '../lib/i18n';
import { getInstallationId } from './pushNotificationService';
import type { AppInstallation } from '../types/database.types';

export async function registerCurrentAppInstallation() {
  const installationId = await getInstallationId();
  const { error } = await supabase.rpc('register_app_installation', {
    p_installation_id: installationId,
    p_device_name: Constants.deviceName ?? 'iPhone',
    p_system_version: String(Platform.Version),
    p_app_version: Constants.expoConfig?.version ?? null,
    p_locale: getCurrentLocale(),
  });
  if (error) throw error;
  return installationId;
}

export async function listAppInstallations(): Promise<
  (AppInstallation & { is_current: boolean })[]
> {
  const [currentId, { data, error }] = await Promise.all([
    getInstallationId(),
    supabase
      .from('app_installations')
      .select('*')
      .order('last_seen_at', { ascending: false }),
  ]);
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, is_current: row.installation_id === currentId })) as (
    AppInstallation & { is_current: boolean }
  )[];
}

export async function signOutOtherInstallations() {
  const [currentId, { error: authError }] = await Promise.all([
    getInstallationId(),
    supabase.auth.signOut({ scope: 'others' }),
  ]);
  if (authError) throw authError;
  const { data, error } = await supabase.rpc('revoke_other_app_installations', {
    p_current_installation_id: currentId,
  });
  if (error) throw error;
  return Number(data) || 0;
}
