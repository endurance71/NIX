import Constants from 'expo-constants';
import type { Json, ProductAnalyticsEventName } from '../types/database.types';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { getInstallationId } from './pushNotificationService';
import { getCurrentLocale } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const ALLOWED_PROPERTY_KEYS = new Set([
  'channel',
  'enabled',
  'has_results',
  'outcome',
  'source',
  'step',
]);

function sanitizeProperties(properties: Record<string, Json | undefined>) {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        ALLOWED_PROPERTY_KEYS.has(key) &&
        value !== undefined &&
        (value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean')
    )
  ) as Record<string, Json>;
}

export async function getProductAnalyticsConsent(): Promise<boolean> {
  const { data, error } = await supabase
    .from('product_analytics_preferences')
    .select('enabled')
    .maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export async function setProductAnalyticsConsent(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_product_analytics_consent', {
    p_enabled: enabled,
  });
  if (error) throw error;
}

export async function recordProductEvent(
  eventName: ProductAnalyticsEventName,
  properties: Record<string, Json | undefined> = {}
): Promise<boolean> {
  if (!iosRoadmapFeatures.analytics) return false;
  try {
    const installationId = await getInstallationId();
    const { data, error } = await supabase.rpc('record_product_analytics_event', {
      p_installation_id: installationId,
      p_event_name: eventName,
      p_app_version: Constants.expoConfig?.version ?? null,
      p_locale: getCurrentLocale(),
      p_properties: sanitizeProperties(properties),
    });
    if (error) {
      console.warn('Product analytics event failed', { eventName, code: error.code });
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
}
