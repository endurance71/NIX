export type ChatReactionA11yEntry = { glyph: string; by: string };

/**
 * VoiceOver label of a text bubble:
 * „{Ty | name}: {body}[, {replyContext}], {time}[, {edited}][, {status}][, {saved}][, reakcje: …]”.
 * Every piece is already localized by the caller; this only joins them.
 */
export function chatMessageAccessibilityLabel({
  sender,
  body,
  replyContext,
  time,
  edited,
  status,
  saved,
  reactions,
  formatReactions,
}: {
  sender: string;
  body: string;
  /** „odpowiedź na Twojego NiXa” for a text that answers a NiX. */
  replyContext?: string | null;
  time: string;
  /** „edytowana” once the sender changed the text. */
  edited?: string | null;
  status?: string | null;
  /** „zapisana przez Ciebie” etc. for a message saved in the chat. */
  saved?: string | null;
  reactions: readonly ChatReactionA11yEntry[];
  formatReactions: (list: string) => string;
}): string {
  const parts = [body.trim() ? `${sender}: ${body.trim()}` : sender];
  if (replyContext) parts.push(replyContext);
  if (time) parts.push(time);
  if (edited) parts.push(edited);
  if (status) parts.push(status);
  if (saved) parts.push(saved);
  if (reactions.length > 0) {
    parts.push(formatReactions(reactions.map((entry) => `${entry.glyph} (${entry.by})`).join(', ')));
  }
  return parts.join(', ');
}

/** Characters left before the composer counter appears (2000-char limit → shown from 1800). */
export const COMPOSER_COUNTER_VISIBLE_FROM = 1_800;

export function shouldShowComposerCounter(length: number, limit: number): boolean {
  return length >= Math.min(COMPOSER_COUNTER_VISIBLE_FROM, limit);
}
