import { setTelemetrySink } from './telemetry';
import type * as SentryTypes from '@sentry/react-native';

let initialized = false;
let sentryModule: typeof SentryTypes | null = null;
// Remote monitoring is opt-in for controlled Internal TestFlight builds only.
const SENTRY_RUNTIME_ENABLED = process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true';
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

function installLocalTelemetrySink() {
  setTelemetrySink((event, payload) => {
    if (isDevRuntime()) {
      console.info(`[telemetry] ${event}`, payload);
    }
  });
}

async function loadSentry() {
  if (sentryModule) return sentryModule;
  sentryModule = await import('@sentry/react-native');
  return sentryModule;
}

export function initMonitoring() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  const enabled = SENTRY_RUNTIME_ENABLED && !isDevRuntime() && Boolean(dsn);

  if (!enabled) {
    installLocalTelemetrySink();
    return;
  }

  installLocalTelemetrySink();

  void loadSentry()
    .then((Sentry) => {
      Sentry.init({
        dsn,
        enabled: true,
        sendDefaultPii: false,
        sampleRate: 1,
        environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'internal-testflight',
        tracesSampleRate: 0.05,
        enableNativeCrashHandling: true,
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.category === 'console') return null;
          if (breadcrumb.data) breadcrumb.data = sanitizeTelemetryData(breadcrumb.data);
          if (breadcrumb.message && breadcrumb.message.length > 120) breadcrumb.message = '[redacted]';
          return breadcrumb;
        },
        beforeSend(event) {
          delete event.user;
          if (event.request) {
            delete event.request.cookies;
            delete event.request.data;
            delete event.request.headers;
          }
          if (event.tags) event.tags = sanitizeTelemetryData(event.tags) as Record<string, string>;
          if (event.extra) event.extra = sanitizeTelemetryData(event.extra);
          if (event.contexts) event.contexts = {};
          for (const exception of event.exception?.values ?? []) {
            if (exception.value) exception.value = '[redacted]';
            for (const frame of exception.stacktrace?.frames ?? []) {
              delete frame.filename;
              delete frame.abs_path;
            }
          }
          return event;
        },
      });

      setTelemetrySink((event, payload) => {
        Sentry.addBreadcrumb({
          category: 'app.telemetry',
          message: event,
          data: sanitizeTelemetryData(payload),
          level: 'info',
        });
      });
    })
    .catch((error) => {
      console.warn('Sentry monitoring could not be initialized', error);
      installLocalTelemetrySink();
    });
}
