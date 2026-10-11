/**
 * Pinned inbox conversations — pure helpers (ordering, toggling, sync merge, fallback detection).
 *
 * Pins are a private per-user preference. They live in `public.conversation_pins` (owner-only RLS)
 * so they follow the user to another device; a device-local mirror keeps them working offline and
 * on backends where that table is not deployed yet (see `conversationPinService`).
 */

export type ConversationPin = {
  peerId: string;
  /** ISO timestamp; pins are shown in the order they were pinned (oldest first). */
  pinnedAt: string;
};

/** Upper bound on pins, like Messages: the pinned avatar grid stays at most three rows of three. */
export const MAX_CONVERSATION_PINS = 9;

function pinTime(pin: ConversationPin): number {
  const time = Date.parse(pin.pinnedAt);
  return Number.isFinite(time) ? time : 0;
}

/** Dedupes by peer (latest entry wins) and sorts by pin time, then peer id for a stable order. */
export function normalizeConversationPins(pins: readonly ConversationPin[]): ConversationPin[] {
  const byPeer = new Map<string, ConversationPin>();
  for (const pin of pins) {
    if (!pin || typeof pin.peerId !== 'string' || !pin.peerId.trim()) continue;
    byPeer.set(pin.peerId, {
      peerId: pin.peerId,
      pinnedAt: typeof pin.pinnedAt === 'string' ? pin.pinnedAt : new Date(0).toISOString(),
    });
  }
  return [...byPeer.values()].sort(
    (left, right) => pinTime(left) - pinTime(right) || left.peerId.localeCompare(right.peerId),
  );
}

/** Parses the device-local mirror; anything malformed reads as "no pins". */
export function parseStoredConversationPins(raw: string | null | undefined): ConversationPin[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeConversationPins(
      parsed.filter(
        (item): item is ConversationPin =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ConversationPin).peerId === 'string' &&
          typeof (item as ConversationPin).pinnedAt === 'string',
      ),
    );
  } catch {
    return [];
  }
}

export function applyConversationPin(
  pins: readonly ConversationPin[],
  peerId: string,
  pinned: boolean,
  nowIso: string,
): ConversationPin[] {
  const others = pins.filter((pin) => pin.peerId !== peerId);
  if (!pinned) return normalizeConversationPins(others);
  const existing = pins.find((pin) => pin.peerId === peerId);
  return normalizeConversationPins([...others, existing ?? { peerId, pinnedAt: nowIso }]);
}

export function canAddConversationPin(pins: readonly ConversationPin[], peerId: string): boolean {
  return pins.some((pin) => pin.peerId === peerId) || pins.length < MAX_CONVERSATION_PINS;
}

/**
 * Splits rows into the pinned ones (in pin order) and the rest (in their recency order). Pins
 * without a visible row (deleted conversation, blocked peer) are ignored. When nothing visible is
 * pinned, `rest` is the same array.
 */
export function splitPinnedRows<T extends { peerId: string }>(
  rows: readonly T[],
  pins: readonly ConversationPin[],
): { pinned: readonly T[]; rest: readonly T[] } {
  if (pins.length === 0 || rows.length === 0) return { pinned: [], rest: rows };
  const rank = new Map(pins.map((pin, index) => [pin.peerId, index] as const));
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const row of rows) (rank.has(row.peerId) ? pinned : rest).push(row);
  if (pinned.length === 0) return { pinned: [], rest: rows };
  pinned.sort((left, right) => rank.get(left.peerId)! - rank.get(right.peerId)!);
  return { pinned, rest };
}

/**
 * Pinned rows first, in pin order; the rest keep their (recency) order. Returns the same array when
 * nothing visible is pinned.
 */
export function orderRowsWithPins<T extends { peerId: string }>(
  rows: readonly T[],
  pins: readonly ConversationPin[],
): readonly T[] {
  const { pinned, rest } = splitPinnedRows(rows, pins);
  return pinned.length === 0 ? rest : [...pinned, ...rest];
}

/**
 * One-time upload of pins made while the backend had no `conversation_pins` table: the local pins
 * the server does not know yet. After that first sync the server is the source of truth.
 */
export function localPinsMissingOnServer(
  serverPins: readonly ConversationPin[],
  localPins: readonly ConversationPin[],
): ConversationPin[] {
  const onServer = new Set(serverPins.map((pin) => pin.peerId));
  return localPins.filter((pin) => !onServer.has(pin.peerId));
}

/**
 * PostgREST `PGRST205` / Postgres `42P01`: the table is not deployed on this backend (production
 * before the migration ships). The client then keeps pins on the device only.
 */
export function isMissingTableError(error: unknown, table: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === 'PGRST205' || code === '42P01') return true;
  return (
    typeof message === 'string' &&
    message.includes(table) &&
    (message.includes('schema cache') || message.includes('does not exist'))
  );
}
