/** Shortest time a camera status / error pill stays up. */
export const CAPTURE_STATUS_MIN_VISIBLE_MS = 3000;
/** Extra reading time per character beyond a short sentence. */
const READING_MS_PER_EXTRA_CHAR = 40;
const SHORT_MESSAGE_CHARS = 50;
const CAPTURE_STATUS_MAX_VISIBLE_MS = 7000;

/** How long a pill with this text stays before it hides itself (~3 s, longer for long text). */
export function captureStatusVisibleMs(message: string): number {
  const extraChars = Math.max(0, message.trim().length - SHORT_MESSAGE_CHARS);
  return Math.min(
    CAPTURE_STATUS_MAX_VISIBLE_MS,
    CAPTURE_STATUS_MIN_VISIBLE_MS + extraChars * READING_MS_PER_EXTRA_CHAR
  );
}
