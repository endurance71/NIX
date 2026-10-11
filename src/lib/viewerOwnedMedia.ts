export function selectOwnedViewerMedia<T>(
  media: {
    renderOwnerId: string | null;
    renderNix: T | null;
    imageUrl: string | null;
    imageReady: boolean;
  },
  ownerId: string | undefined,
) {
  if (media.renderOwnerId !== ownerId)
    return { renderNix: null, imageUrl: null, imageReady: false };
  return { renderNix: media.renderNix, imageUrl: media.imageUrl, imageReady: media.imageReady };
}
