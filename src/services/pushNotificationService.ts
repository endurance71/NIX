import { AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { getCurrentLocale } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const INSTALLATION_ID_KEY = 'nix.push.installation-id.v1';
const DESIRED_PREFIX = 'nix.push.desired.v1';
const PROMPTED_PREFIX = 'nix.push.prompted.v1';

export type PushPermissionState = 'not_determined' | 'denied' | 'granted' | 'unavailable';

export type PushDeviceState = {
  enabled: boolean;
  exists: boolean;
};

function userKey(prefix: string, userId: string) {
  return `${prefix}.${userId}`;
}

export async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, created);
  return created;
}

export async function getLocalPushDesired(userId: string) {
  return (await SecureStore.getItemAsync(userKey(DESIRED_PREFIX, userId))) === 'true';
}

export async function setLocalPushDesired(userId: string, enabled: boolean) {
  await SecureStore.setItemAsync(userKey(DESIRED_PREFIX, userId), enabled ? 'true' : 'false');
}

export async function wasPushPromptOffered(userId: string) {
  return (await SecureStore.getItemAsync(userKey(PROMPTED_PREFIX, userId))) === 'true';
}

export async function markPushPromptOffered(userId: string) {
  await SecureStore.setItemAsync(userKey(PROMPTED_PREFIX, userId), 'true');
}

export function resolvePushPermissionState(
  permissions: Notifications.NotificationPermissionsStatus
): PushPermissionState {
  if (Platform.OS !== 'ios') return permissions.granted ? 'granted' : 'unavailable';
  const status = permissions.ios?.status;
  if (status === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'not_determined';
  if (status === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
  if (
    status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  return permissions.granted ? 'granted' : 'unavailable';
}

export async function getPushPermissionState() {
  return resolvePushPermissionState(await Notifications.getPermissionsAsync());
}

const IOS_PUSH_PERMISSIONS = {
  allowAlert: true,
  allowBadge: true,
  allowSound: true,
} as const;

export async function requestPushPermission() {
  const current = await getPushPermissionState();
  if (current !== 'not_determined') return current;
  const next = await Notifications.requestPermissionsAsync({
    ios: IOS_PUSH_PERMISSIONS,
  });
  return resolvePushPermissionState(next);
}

/** Re-request badge option for installs that were granted without allowBadge. */
export async function ensureBadgePermission() {
  if (Platform.OS !== 'ios') return;
  const permissions = await Notifications.getPermissionsAsync();
  if (resolvePushPermissionState(permissions) !== 'granted') return;
  if (permissions.ios?.allowsBadge === true) return;
  await Notifications.requestPermissionsAsync({ ios: IOS_PUSH_PERMISSIONS });
}

export async function syncAppIconBadge(count: number) {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch (error) {
    console.warn('App icon badge sync failed', error);
  }
}

export async function clearAppIconBadge() {
  await syncAppIconBadge(0);
}

function normalizeDeviceState(value: unknown): PushDeviceState {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return { enabled: false, exists: false };
  const candidate = row as { enabled?: unknown; exists?: unknown };
  return {
    enabled: candidate.enabled === true,
    exists: candidate.exists === true,
  };
}

export async function getPushDeviceState(installationId: string): Promise<PushDeviceState> {
  const { data, error } = await supabase.rpc('get_push_device_state', {
    p_installation_id: installationId,
  });
  if (error) throw error;
  return normalizeDeviceState(data);
}

async function getPushTokens(devicePushToken?: Notifications.DevicePushToken) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Brak EAS projectId dla powiadomień push.');
  const nativeToken = devicePushToken ?? (await Notifications.getDevicePushTokenAsync());
  const expoToken = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: nativeToken });
  const nativeValue = typeof nativeToken.data === 'string' ? nativeToken.data : null;
  return { expoToken: expoToken.data, nativeToken: nativeValue };
}

export async function registerCurrentPushDevice(
  userId: string,
  devicePushToken?: Notifications.DevicePushToken
) {
  const [installationId, { expoToken, nativeToken }] = await Promise.all([
    getInstallationId(),
    getPushTokens(devicePushToken),
  ]);
  const { error } = await supabase.rpc('register_push_device', {
    p_installation_id: installationId,
    p_expo_push_token: expoToken,
    p_native_push_token: nativeToken,
    p_platform: Platform.OS,
    p_locale: getCurrentLocale(),
    p_app_version: Constants.expoConfig?.version ?? null,
  });
  if (error) throw error;
  await setLocalPushDesired(userId, true);
  return { installationId, expoToken };
}

export async function disableCurrentPushDevice(userId: string, reason: string) {
  const installationId = await getInstallationId();
  const { error } = await supabase.rpc('disable_push_device', {
    p_installation_id: installationId,
    p_reason: reason,
  });
  if (error) throw error;
  await setLocalPushDesired(userId, false);
  await clearAppIconBadge();
}

export async function disableCurrentPushDeviceBeforeSignOut() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const installationId = await getInstallationId();
  await supabase.rpc('disable_push_device', {
    p_installation_id: installationId,
    p_reason: 'signed_out',
  });
  await clearAppIconBadge();
}

export function openSystemNotificationSettings() {
  return Linking.openSettings();
}

export function subscribeToAppForeground(listener: () => void) {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') listener();
  });
  return () => subscription.remove();
}
