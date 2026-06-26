import { setTelemetrySink } from './telemetry';

let initialized = false;

function isDevRuntime() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

export function initMonitoring() {
  if (initialized) return;
  initialized = true;

  setTelemetrySink((event, payload) => {
    if (isDevRuntime()) {
      console.info(`[telemetry] ${event}`, payload);
    }
  });
}
