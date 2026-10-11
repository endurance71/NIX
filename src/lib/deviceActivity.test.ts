import { describe, expect, it } from 'vitest';
import { formatDeviceLastSeen } from './deviceActivity';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;
const now = Date.parse('2026-10-11T12:00:00Z');

describe('formatDeviceLastSeen', () => {
  it('is relative within a day', () => {
    expect(formatDeviceLastSeen('2026-10-11T11:59:30Z', now, 'pl', t)).toBe('devices.lastSeenJustNow');
    expect(formatDeviceLastSeen('2026-10-11T11:58:00Z', now, 'pl', t)).toBe('devices.lastSeenMinutes:{"count":2}');
    expect(formatDeviceLastSeen('2026-10-11T09:00:00Z', now, 'pl', t)).toBe('devices.lastSeenHours:{"count":3}');
  });
  it('shows a short date without seconds after a day', () => {
    const label = formatDeviceLastSeen('2026-10-08T09:05:07Z', now, 'pl', t);
    expect(label.startsWith('devices.lastSeen:')).toBe(true);
    expect(label).not.toMatch(/:07/);
  });
  it('handles an unparsable timestamp', () => {
    expect(formatDeviceLastSeen('nope', now, 'pl', t)).toBe('devices.lastSeenUnknown');
  });
});
