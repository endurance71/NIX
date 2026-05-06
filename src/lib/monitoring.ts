import * as Sentry from '@sentry/react-native';
import { setTelemetrySink } from './telemetry';

let initialized = false;

function isDevRuntime() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

export function initMonitoring() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: isDevRuntime() ? 0 : 0.1,
      enableNativeCrashHandling: true,
    });
  }

  setTelemetrySink((event, payload) => {
    if (dsn) {
      Sentry.addBreadcrumb({
        category: 'telemetry',
        message: event,
        data: payload,
        level: payload.status === 'failure' ? 'error' : 'info',
      });

      if (payload.status === 'failure') {
        Sentry.captureMessage(event, 'error');
      }
      return;
    }

    if (isDevRuntime()) {
      console.info(`[telemetry] ${event}`, payload);
    }
  });
}
