import { acknowledgeViewedNix } from './viewedAckQueue';

export async function markViewerSlideViewed(
  item: { id: string; media_path: string },
  onDelivered?: () => void
): Promise<boolean> {
  const delivered = await acknowledgeViewedNix(item);
  if (delivered) onDelivered?.();
  return delivered;
}
