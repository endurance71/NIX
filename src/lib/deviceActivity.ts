type Translate = (key: string, options?: Record<string, unknown>) => string;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function shortDateTime(date: Date, locale: string): string {
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter.format(date);
}

/**
 * "Ostatnia aktywność: 2 min temu" — relative for the last day, then a short date without
 * seconds (the raw `toLocaleString()` showed "11.10.2026, 13:20:17").
 */
export function formatDeviceLastSeen(
  lastSeenAt: string,
  nowMs: number,
  locale: string,
  t: Translate,
): string {
  const seenAt = Date.parse(lastSeenAt);
  if (!Number.isFinite(seenAt)) return t('devices.lastSeenUnknown');
  const elapsed = Math.max(0, nowMs - seenAt);
  if (elapsed < MINUTE_MS) return t('devices.lastSeenJustNow');
  if (elapsed < HOUR_MS) return t('devices.lastSeenMinutes', { count: Math.floor(elapsed / MINUTE_MS) });
  if (elapsed < DAY_MS) return t('devices.lastSeenHours', { count: Math.floor(elapsed / HOUR_MS) });
  return t('devices.lastSeen', { date: shortDateTime(new Date(seenAt), locale) });
}
