type TelemetryValue = string | number | boolean | null | undefined;
type TelemetryPayload = Record<string, TelemetryValue>;

export function trackEvent(event: string, payload: TelemetryPayload = {}) {
  const safePayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
  // Stub telemetry: celowo bez tokenów i danych wrażliwych.
  console.info(`[telemetry] ${event}`, safePayload);
}
