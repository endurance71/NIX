type TelemetryValue = string | number | boolean | null | undefined;
export type TelemetryPayload = Record<string, TelemetryValue>;

type TelemetrySink = (event: string, payload: Record<string, Exclude<TelemetryValue, undefined>>) => void;

let telemetrySink: TelemetrySink | null = null;

function isDevRuntime() {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

export function setTelemetrySink(sink: TelemetrySink | null) {
  telemetrySink = sink;
}

export function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function sanitizePayload(payload: TelemetryPayload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Record<string, Exclude<TelemetryValue, undefined>>;
}

export function trackEvent(event: string, payload: TelemetryPayload = {}) {
  const safePayload = sanitizePayload(payload);

  if (telemetrySink) {
    telemetrySink(event, safePayload);
    return;
  }

  if (isDevRuntime()) {
    // Stub telemetry: celowo bez tokenów i danych wrażliwych.
    console.info(`[telemetry] ${event}`, safePayload);
  }
}

export function trackDuration(event: string, startedAtMs: number, payload: TelemetryPayload = {}) {
  trackEvent(event, {
    ...payload,
    duration_ms: Math.max(0, Math.round(nowMs() - startedAtMs)),
  });
}
