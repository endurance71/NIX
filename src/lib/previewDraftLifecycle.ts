let pendingClear: (() => void) | null = null;

/**
 * Send-to enqueues a copy of the media, but the preview below it stays mounted until the dismiss
 * transition ends. Clearing the draft right away made it re-render as „photo not captured” (or
 * drop the overlays) under the closing sheet, so the clear waits for the preview to unmount.
 */
export function clearDraftWhenPreviewCloses(clear: () => void) {
  pendingClear = clear;
}

export function flushDraftClearOnPreviewClose() {
  const clear = pendingClear;
  pendingClear = null;
  clear?.();
}
