/**
 * Memories („Wspomnienia”): a private, on-device album of NiXes the user SENT. Received media is
 * never stored here. Pure logic only — file I/O and encryption live in `services/memoriesStore`.
 */

export const MEMORIES_MAX_BYTES = 500 * 1024 * 1024;
/**
 * Plaintext bytes per AES-GCM chunk. A multiple of 3, so the base64 of consecutive chunks can be
 * concatenated into one valid base64 string (photos are shown as a data URI, never as a file).
 */
export const MEMORY_CHUNK_BYTES = 3 * 256 * 1024;
/** IV (12) + tag (16) added by AES-GCM `combined()` to every chunk. */
export const MEMORY_CHUNK_OVERHEAD_BYTES = 28;
export const MEMORY_THUMBNAIL_MAX_EDGE = 360;

export type MemoryMediaType = 'image' | 'video';

export type MemoryEntry = {
  version: 1;
  id: string;
  ownerId: string;
  mediaType: MemoryMediaType;
  /** Milliseconds since epoch, when the NiX was sent. */
  createdAt: number;
  /** Display names snapshotted at send time (friends may rename or be removed later). */
  recipientNames: string[];
  extension: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  plainBytes: number;
  chunkCount: number;
  /** Encrypted media + thumbnail size on disk; what the storage cap counts. */
  storedBytes: number;
  /** Plaintext size of the sealed grid thumbnail; null when none could be made. */
  thumbnailBytes: number | null;
};

export type MemoriesIndex = { version: 1; ownerId: string; entries: MemoryEntry[] };

export type MemoriesPreference = 'on' | 'off' | 'unset';

const EXTENSION_PATTERN = /^[a-z0-9]{1,5}$/;

function finiteOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function isMemoryEntry(value: unknown, ownerId: string): value is MemoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<MemoryEntry>;
  return entry.version === 1
    && typeof entry.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(entry.id)
    && entry.ownerId === ownerId
    && (entry.mediaType === 'image' || entry.mediaType === 'video')
    && typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
    && Array.isArray(entry.recipientNames) && entry.recipientNames.every((name) => typeof name === 'string')
    && typeof entry.extension === 'string' && EXTENSION_PATTERN.test(entry.extension)
    && typeof entry.plainBytes === 'number' && entry.plainBytes >= 0
    && typeof entry.chunkCount === 'number' && Number.isInteger(entry.chunkCount) && entry.chunkCount >= 1
    && entry.chunkCount === memoryChunkCount(entry.plainBytes)
    && typeof entry.storedBytes === 'number' && entry.storedBytes >= 0
    && (entry.thumbnailBytes === null || (typeof entry.thumbnailBytes === 'number' && entry.thumbnailBytes > 0));
}

/** Parses the decrypted index; invalid rows are dropped (their files are swept as orphans). */
export function parseMemoriesIndex(json: string, ownerId: string): MemoriesIndex {
  const empty: MemoriesIndex = { version: 1, ownerId, entries: [] };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return empty;
  }
  if (typeof value !== 'object' || value === null) return empty;
  const index = value as Partial<MemoriesIndex>;
  if (index.version !== 1 || index.ownerId !== ownerId || !Array.isArray(index.entries)) return empty;
  const seen = new Set<string>();
  const entries = index.entries.filter((entry): entry is MemoryEntry => {
    if (!isMemoryEntry(entry, ownerId) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).map((entry) => ({
    ...entry,
    durationMs: finiteOrNull(entry.durationMs),
    width: finiteOrNull(entry.width),
    height: finiteOrNull(entry.height),
  }));
  return { version: 1, ownerId, entries };
}

export function memoryChunkCount(plainBytes: number) {
  return Math.max(1, Math.ceil(plainBytes / MEMORY_CHUNK_BYTES));
}

/** Encrypted size of a payload split into chunks. */
export function memoryCipherBytes(plainBytes: number) {
  return plainBytes + memoryChunkCount(plainBytes) * MEMORY_CHUNK_OVERHEAD_BYTES;
}

/**
 * AES-GCM additional data of one chunk: binds it to its owner, memory, position and to being the
 * last one, so chunks cannot be swapped between memories, reordered or truncated undetected.
 */
export function memoryChunkAdditionalData(ownerId: string, memoryId: string, kind: 'media' | 'thumb', index: number, isLast: boolean) {
  return new TextEncoder().encode(`nix.memories.v1|${ownerId}|${memoryId}|${kind}|${index}|${isLast ? 1 : 0}`);
}

export function memoriesIndexAdditionalData(ownerId: string) {
  return new TextEncoder().encode(`nix.memories.index.v1|${ownerId}`);
}

/**
 * Oldest-first ids to delete so that `incomingBytes` fits under the cap. A single item larger than
 * the cap is rejected by the caller before this runs.
 */
export function planMemoriesPrune(entries: readonly MemoryEntry[], incomingBytes: number, maxBytes = MEMORIES_MAX_BYTES) {
  let total = incomingBytes + entries.reduce((sum, entry) => sum + entry.storedBytes, 0);
  const prune: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
    if (total <= maxBytes) break;
    prune.push(entry.id);
    total -= entry.storedBytes;
  }
  return prune;
}

export function memoriesTotalBytes(entries: readonly MemoryEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.storedBytes, 0);
}

export type MemoriesMonthSection = { key: string; year: number; month: number; entries: MemoryEntry[] };

/** Newest month first, newest memory first inside a month (local calendar). */
export function groupMemoriesByMonth(entries: readonly MemoryEntry[]): MemoriesMonthSection[] {
  const sections = new Map<string, MemoriesMonthSection>();
  for (const entry of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    const date = new Date(entry.createdAt);
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    let section = sections.get(key);
    if (!section) {
      section = { key, year, month, entries: [] };
      sections.set(key, section);
    }
    section.entries.push(entry);
  }
  return [...sections.values()];
}

/** „październik 2026” / „October 2026”, capitalised for a section header. */
const monthFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatMemoriesMonth(year: number, month: number, locale: string) {
  let formatter = monthFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
    monthFormatters.set(locale, formatter);
  }
  const label = formatter.format(new Date(year, month, 1));
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

/** Megabytes with one decimal below 10 MB, whole numbers above. */
export function formatMemoriesMegabytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes > 0 && megabytes < 0.1) return '0.1';
  return megabytes < 10 ? megabytes.toFixed(1) : String(Math.round(megabytes));
}

export function parseMemoriesPreference(value: string | null | undefined): MemoriesPreference {
  return value === 'on' || value === 'off' ? value : 'unset';
}

export type MemoryCaptureDecision = 'save' | 'ask' | 'skip';

/**
 * Saving is opt-in. While undecided, the user is asked once after a send — but not while the
 * post-send push permission rationale may be on screen (two prompts at once); then the next send asks.
 */
export function memoryCaptureDecision(preference: MemoriesPreference, pushRationaleMayShow: boolean, promptInFlight: boolean): MemoryCaptureDecision {
  if (preference === 'on') return 'save';
  if (preference === 'off') return 'skip';
  return pushRationaleMayShow || promptInFlight ? 'skip' : 'ask';
}

export type MemoryRecipientProfile = { id: string; username?: string | null; display_name?: string | null };

/** Display names of the recipients, in send order; unknown ids are skipped. */
export function memoryRecipientNames(recipientIds: readonly string[], profiles: readonly MemoryRecipientProfile[]) {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const names: string[] = [];
  for (const id of recipientIds) {
    const profile = byId.get(id);
    if (!profile) continue;
    const name = profile.display_name?.trim() || (profile.username ? `@${profile.username}` : '');
    if (name) names.push(name);
  }
  return names;
}

export function memoryFileExtension(uri: string, mediaType: MemoryMediaType) {
  const match = /\.([A-Za-z0-9]{1,5})(?:[?#].*)?$/.exec(uri);
  const extension = match?.[1]?.toLowerCase();
  if (extension && EXTENSION_PATTERN.test(extension)) return extension;
  return mediaType === 'image' ? 'jpg' : 'mp4';
}

export function memoryContentType(entry: Pick<MemoryEntry, 'mediaType' | 'extension'>) {
  if (entry.mediaType === 'video') return entry.extension === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (entry.extension === 'png') return 'image/png';
  if (entry.extension === 'heic' || entry.extension === 'heif') return 'image/heic';
  if (entry.extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** „0:07” style clip length for the grid badge. */
export function formatMemoryDuration(durationMs: number | null) {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** Grid labels („5 października, 14:05”) and the viewer title (with the year), cached per locale. */
export function formatMemoryDate(timestamp: number, locale: string, withYear = false) {
  const cacheKey = `${locale}|${withYear ? 'y' : '-'}`;
  let formatter = dateFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' as const } : {}),
      hour: '2-digit',
      minute: '2-digit',
    });
    dateFormatters.set(cacheKey, formatter);
  }
  return formatter.format(new Date(timestamp));
}
