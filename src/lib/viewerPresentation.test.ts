import { describe, expect, it } from 'vitest';
import {
  formatViewerRelativeTime,
  normalizeViewerReplyBody,
  viewerMediaAccessibilityLabel,
  viewerSenderName,
  viewerSlidePositionLabel,
} from './viewerPresentation';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

describe('viewerSenderName', () => {
  it('prefers the display name, then @username', () => {
    expect(viewerSenderName({ display_name: ' Ania ', username: 'ania' })).toBe('Ania');
    expect(viewerSenderName({ display_name: '  ', username: 'ania' })).toBe('@ania');
    expect(viewerSenderName({ username: null })).toBeNull();
    expect(viewerSenderName(null)).toBeNull();
  });
});

describe('formatViewerRelativeTime', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');

  it('uses the smallest sensible unit', () => {
    expect(formatViewerRelativeTime('2026-10-10T11:59:30Z', now, t)).toBe('viewer.timeJustNow');
    expect(formatViewerRelativeTime('2026-10-10T11:55:00Z', now, t)).toBe(
      'viewer.timeMinutes:{"count":5}',
    );
    expect(formatViewerRelativeTime('2026-10-10T09:00:00Z', now, t)).toBe(
      'viewer.timeHours:{"count":3}',
    );
    expect(formatViewerRelativeTime('2026-10-08T11:00:00Z', now, t)).toBe(
      'viewer.timeDays:{"count":2}',
    );
  });

  it('treats a clock skew into the future as now and skips unknown dates', () => {
    expect(formatViewerRelativeTime('2026-10-10T12:05:00Z', now, t)).toBe('viewer.timeJustNow');
    expect(formatViewerRelativeTime(null, now, t)).toBeNull();
    expect(formatViewerRelativeTime('nope', now, t)).toBeNull();
  });
});

describe('viewer accessibility labels', () => {
  it('describes the position as 1-based', () => {
    expect(viewerSlidePositionLabel(1, 5, t)).toBe('viewer.slidePosition:{"current":2,"total":5}');
  });

  it('names the media kind and the sender when known', () => {
    expect(
      viewerMediaAccessibilityLabel({ mediaType: 'image', senderName: 'Ania', slideIndex: 1, total: 5, t }),
    ).toBe('viewer.a11yMedia.photoFrom:{"name":"Ania","current":2,"total":5}');
    expect(
      viewerMediaAccessibilityLabel({ mediaType: 'video', senderName: null, slideIndex: 0, total: 1, t }),
    ).toBe('viewer.a11yMedia.video:{"current":1,"total":1}');
  });
});

describe('normalizeViewerReplyBody', () => {
  it('trims, rejects empty replies and respects the length limit', () => {
    expect(normalizeViewerReplyBody('  hej  ', 10)).toBe('hej');
    expect(normalizeViewerReplyBody('   ', 10)).toBeNull();
    expect(normalizeViewerReplyBody('a'.repeat(10), 10)).toHaveLength(10);
    expect(normalizeViewerReplyBody('a'.repeat(11), 10)).toBeNull();
  });
});
