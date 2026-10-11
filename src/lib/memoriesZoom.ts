/**
 * Which Memories grid cell is the zoom source (iOS 18+ zoom transition, like Photos).
 *
 * The viewer pages through memories, so closing must zoom into the cell of the memory on screen,
 * not the one first tapped. One fixed source identifier travels with the navigation; the grid
 * cell of the focused memory carries it, and the viewer moves the focus as it pages.
 */
export const MEMORIES_ZOOM_SOURCE_ID = 'nix-memories-zoom';

let focusedId: string | null = null;
const listeners = new Set<() => void>();

export function getMemoriesZoomFocus(): string | null {
  return focusedId;
}

export function subscribeMemoriesZoomFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setFocus(id: string | null) {
  if (focusedId === id) return;
  focusedId = id;
  for (const listener of listeners) listener();
}

/**
 * Gives the identifier to the cell of `id`. The old cell lets go one frame earlier: two cells
 * holding it in the same native update could leave the identifier unregistered.
 */
export function moveMemoriesZoomFocus(id: string, then?: () => void) {
  if (focusedId === id) {
    then?.();
    return;
  }
  setFocus(null);
  requestAnimationFrame(() => {
    setFocus(id);
    if (then) requestAnimationFrame(then);
  });
}
