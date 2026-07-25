import { acknowledgeViewedNix } from './viewedAckQueue';

export async function markViewerSlideViewed(
  item: { id: string; media_path: string },
  ackType: 'viewed' | 'replayed' = 'viewed',
  onDelivered?: () => void
): Promise<boolean> {
  const delivered = await acknowledgeViewedNix(item, ackType);
  if (delivered) onDelivered?.();
  return delivered;
}

