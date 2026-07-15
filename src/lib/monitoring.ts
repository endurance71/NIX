import { setTelemetrySink } from './telemetry';
import * as Sentry from '@sentry/react-native';

let initialized = false;
// Temporary TestFlight policy: keep the SDK wired, but make remote monitoring
// impossible to enable with an environment variable alone.
const SENTRY_RUNTIME_ENABLED = false;
const SENSITIVE_TELEMETRY_KEY = /(^|_)(authorization|content|email|id|message|path|secret|token|url|username)$/i;

function isDevRuntime() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

function sanitizeTelemetryData(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).flatMap(([key, value]) => {
      if (SENSITIVE_TELEMETRY_KEY.test(key)) return [];
      if (typeof value === 'string' && value.length > 120) return [[key, '[redacted]']];
      return [[key, value]];
    })
  );
}

export function initMonitoring() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const enabled = SENTRY_RUNTIME_ENABLED && !isDevRuntime() && Boolean(dsn);

  Sentry.init({
    dsn,
    enabled,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    enableNativeCrashHandling: true,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null;
      if (breadcrumb.data) breadcrumb.data = sanitizeTelemetryData(breadcrumb.data);
      if (breadcrumb.message && breadcrumb.message.length > 120) breadcrumb.message = '[redacted]';
      return breadcrumb;
    },
    beforeSend(event) {
      if (event.user) event.user = { id: event.user.id };
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.headers;
      }
      return event;
    },
  });

  setTelemetrySink((event, payload) => {
    if (enabled) {
      Sentry.addBreadcrumb({
        category: 'app.telemetry',
        message: event,
        data: sanitizeTelemetryData(payload),
        level: 'info',
      });
    } else if (isDevRuntime()) {
      console.info(`[telemetry] ${event}`, payload);
    }
  });
}
