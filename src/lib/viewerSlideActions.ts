import { markNixViewedWithCleanup } from '../services/nixService';

export async function markViewerSlideViewed(
  item: { id: string; media_path: string },
  onCounted: () => void
): Promise<void> {
  try {
    await markNixViewedWithCleanup(item.id, item.media_path);
  } catch (err) {
    console.error('Nie udało się zaktualizować statusu', err);
  } finally {
    onCounted();
  }
}
