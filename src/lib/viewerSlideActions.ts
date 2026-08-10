import { acknowledgeViewedNix } from './viewedAckQueue';
import { markNixUnplayable } from '../services/nixService';
import { trackEvent } from './telemetry';

export async function markViewerSlideViewed(
  item: { id: string; media_path: string },
  ackType: 'viewed' | 'replayed' = 'viewed',
  onDelivered?: () => void
): Promise<boolean> {
  const delivered = await acknowledgeViewedNix(item, ackType);
  if (delivered) onDelivered?.();
  return delivered;
}

/** Dead/missing media — not a successful open; no replay window. */
export async function markViewerSlideUnplayable(
  item: { id: string; media_path: string },
  reason: string,
  onDelivered?: () => void
): Promise<boolean> {
  trackEvent('viewer_slide_unplayable', {
    reason,
    nix_id: item.id,
  });
  try {
    await markNixUnplayable(item.id);
    onDelivered?.();
    return true;
  } catch (error) {
    console.warn('Nie udało się oznaczyć nieodtwarzalnego NiXa', error);
    return false;
  }
}

