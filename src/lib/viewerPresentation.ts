/** Pure copy/labels for the media viewer's sender header, HUD and VoiceOver. */

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ViewerSenderProfile = {
  username?: string | null;
  display_name?: string | null;
};

/** Display name, else `@username`, else null (the header then shows only the avatar fallback). */
export function viewerSenderName(profile: ViewerSenderProfile | null | undefined): string | null {
  const displayName = profile?.display_name?.trim();
  if (displayName) return displayName;
  const username = profile?.username?.trim();
  return username ? `@${username}` : null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Short relative send time like Stories ("teraz", "5 min", "3 godz.", "2 d").
 * Hermes has no `Intl.RelativeTimeFormat`, so the units come from i18n.
 */
export function formatViewerRelativeTime(
  createdAt: string | null | undefined,
  nowMs: number,
  t: Translate,
): string | null {
  if (!createdAt) return null;
  const sentAt = Date.parse(createdAt);
  if (!Number.isFinite(sentAt)) return null;
  const elapsed = Math.max(0, nowMs - sentAt);
  if (elapsed < MINUTE_MS) return t('viewer.timeJustNow');
  if (elapsed < HOUR_MS) return t('viewer.timeMinutes', { count: Math.floor(elapsed / MINUTE_MS) });
  if (elapsed < DAY_MS) return t('viewer.timeHours', { count: Math.floor(elapsed / HOUR_MS) });
  return t('viewer.timeDays', { count: Math.floor(elapsed / DAY_MS) });
}

/** "NiX 2 z 5" — the HUD's accessibility value. */
export function viewerSlidePositionLabel(slideIndex: number, total: number, t: Translate): string {
  return t('viewer.slidePosition', { current: slideIndex + 1, total: Math.max(total, slideIndex + 1) });
}

/** "Zdjęcie od Ani, 2 z 5" — the media's accessibility label. */
export function viewerMediaAccessibilityLabel(params: {
  mediaType: string | null | undefined;
  senderName: string | null;
  slideIndex: number;
  total: number;
  t: Translate;
}): string {
  const { mediaType, senderName, slideIndex, total, t } = params;
  const kind = mediaType === 'video' ? 'video' : 'photo';
  const position = { current: slideIndex + 1, total: Math.max(total, slideIndex + 1) };
  return senderName
    ? t(`viewer.a11yMedia.${kind}From`, { name: senderName, ...position })
    : t(`viewer.a11yMedia.${kind}`, position);
}

/** Trimmed reply body, or null when there is nothing (or too much) to send. */
export function normalizeViewerReplyBody(body: string, maxLength: number): string | null {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}
