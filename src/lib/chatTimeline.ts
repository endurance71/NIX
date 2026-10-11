import type { TextMessage } from '../types/database.types';
import type { ChatNixEvent, NixPublicProfile } from '../services/nixService';
import type { DurableUploadJob } from '../types/uploadQueue';
import type { InboxBundle } from './inboxQuery';

const SEPARATOR_GAP_MS = 60 * 60 * 1000;
/** Messages from one sender at most this far apart share a bubble group. */
export const BUBBLE_GROUP_GAP_MS = 2 * 60 * 1000;

export type ChatTimelineSeparator = {
  type: 'separator';
  id: string;
  label: string;
  created_at: string;
};

/**
 * iMessage-style bubble grouping: consecutive messages from one sender within
 * `BUBBLE_GROUP_GAP_MS` form a group. Only the last bubble of a group has a tail; inner corners
 * are tighter and the spacing inside a group is reduced.
 */
export type ChatBubbleGroupPosition = 'single' | 'first' | 'middle' | 'last';

export type ChatTimelineText<T extends TextMessage = TextMessage> = {
  type: 'text';
  id: string;
  created_at: string;
  message: T;
  /** Position in its sender group; computed by the timeline builders (absent = `single`). */
  group?: ChatBubbleGroupPosition;
};

export type ChatTimelineNix = {
  type: 'nix';
  id: string;
  created_at: string;
  nix: ChatNixEvent;
};

/**
 * One outgoing media message for its whole life (SEND-8): the local upload and, once it lands,
 * the server NiX matched by `client_upload_id === job.batchId`. The key (`media-${jobId}`), the
 * item type and the position (anchored to `job.createdAt`) never change, so the cell is not
 * remounted and the list does not jump when the upload turns into a delivered NiX.
 */
export type ChatTimelineMedia = {
  type: 'media';
  id: string;
  created_at: string;
  jobId: string;
  job: DurableUploadJob | null;
  nix: ChatNixEvent | null;
};

/** Session memory of an outgoing upload, kept after the job leaves the local queue. */
export type ChatMediaAnchor = {
  jobId: string;
  batchId: string;
  createdAt: number;
};

export type ChatTimelineItem<T extends TextMessage = TextMessage> =
  | ChatTimelineSeparator
  | ChatTimelineText<T>
  | ChatTimelineNix
  | ChatTimelineMedia;

/** @deprecated Use ChatTimelineText — kept for older imports in tests. */
export type ChatTimelineMessage<T extends TextMessage = TextMessage> = ChatTimelineText<T>;

export function sortMessagesAscending<T extends { created_at: string }>(messages: readonly T[]): T[] {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
  });
}

const TIME_ONLY_OPTIONS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const DAY_WITHOUT_YEAR_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
};
const DAY_WITH_YEAR_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

function getCachedDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${JSON.stringify(options)}`;
  const cached = dateTimeFormatCache.get(cacheKey);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  dateTimeFormatCache.set(cacheKey, formatter);
  return formatter;
}

/** Localized templates for the relative day names; `{{time}}`-style formatting is the caller's. */
export type ChatSeparatorRelativeLabels = {
  today: (time: string) => string;
  yesterday: (time: string) => string;
};

const WEEKDAY_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  hour: 'numeric',
  minute: '2-digit',
};
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days between two local dates (DST-safe: rounds the 23/25 h days). */
function calendarDaysBetween(earlier: Date, later: Date): number {
  return Math.round((startOfLocalDay(later) - startOfLocalDay(earlier)) / DAY_MS);
}

function capitalizeFirst(value: string, locale: string): string {
  return value.length > 0 ? value.charAt(0).toLocaleUpperCase(locale) + value.slice(1) : value;
}

/** Message time („14:05” / „2:05 PM”) for labels and VoiceOver. */
export function formatChatTime(input: string | Date, locale: string): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return '';
  return getCachedDateTimeFormat(locale, TIME_ONLY_OPTIONS).format(date);
}

/**
 * iMessage-style separator: „Dziś 14:05”, „Wczoraj 14:05”, „Poniedziałek 14:05” within the last
 * week, then the full date. Without `relative` labels today shows the time only (older callers).
 */
export function formatChatSeparatorLabel(
  input: string | Date,
  locale: string,
  now: Date = new Date(),
  relative?: ChatSeparatorRelativeLabels
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return '';

  const daysAgo = calendarDaysBetween(date, now);
  const time = getCachedDateTimeFormat(locale, TIME_ONLY_OPTIONS).format(date);

  if (daysAgo <= 0) {
    return relative ? relative.today(time) : time;
  }
  if (daysAgo === 1 && relative) {
    return relative.yesterday(time);
  }
  if (daysAgo < 7) {
    return capitalizeFirst(
      getCachedDateTimeFormat(locale, WEEKDAY_TIME_OPTIONS).format(date),
      locale
    );
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return getCachedDateTimeFormat(
    locale,
    sameYear ? DAY_WITHOUT_YEAR_OPTIONS : DAY_WITH_YEAR_OPTIONS
  ).format(date);
}

type TimelineStamp = { id: string; created_at: string };

function stampMs(createdAt: string): number {
  const value = new Date(createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function withSeparators<T extends TimelineStamp>(
  events: readonly T[],
  locale: string,
  now: Date,
  mapEvent: (event: T) => Exclude<ChatTimelineItem, ChatTimelineSeparator>,
  relative?: ChatSeparatorRelativeLabels
): ChatTimelineItem[] {
  const sorted = sortMessagesAscending(events);
  const items: ChatTimelineItem[] = [];
  let lastStamp: number | null = null;

  for (const event of sorted) {
    const validStamp = stampMs(event.created_at);
    const needsSeparator =
      lastStamp === null ||
      validStamp - lastStamp >= SEPARATOR_GAP_MS ||
      new Date(validStamp).toDateString() !== new Date(lastStamp).toDateString();

    if (needsSeparator) {
      items.push({
        type: 'separator',
        id: `sep-${event.id}`,
        label: formatChatSeparatorLabel(event.created_at, locale, now, relative),
        created_at: event.created_at,
      });
    }

    items.push(mapEvent(event));
    lastStamp = validStamp;
  }

  return assignBubbleGroups(items);
}

/** Text bubbles that can join a group: everything but centred system lines. */
function groupableText(item: ChatTimelineItem | undefined): ChatTimelineText | null {
  if (!item || item.type !== 'text' || item.message.is_system) return null;
  return item;
}

function joinsGroup(previous: ChatTimelineText | null, next: ChatTimelineText | null): boolean {
  if (!previous || !next) return false;
  if (previous.message.sender_id !== next.message.sender_id) return false;
  const gap = stampMs(next.created_at) - stampMs(previous.created_at);
  return gap >= 0 && gap <= BUBBLE_GROUP_GAP_MS;
}

/**
 * Sets `group` on every text item (in place: the items were just created by the builder). A
 * separator, a NiX, an upload or a system line between two texts always ends the group, so
 * timestamps keep appearing only between groups.
 */
export function assignBubbleGroups<I extends ChatTimelineItem>(items: I[]): I[] {
  for (let index = 0; index < items.length; index += 1) {
    const current = groupableText(items[index]);
    if (!current) continue;
    const joinsPrevious = joinsGroup(groupableText(items[index - 1]), current);
    const joinsNext = joinsGroup(current, groupableText(items[index + 1]));
    current.group = joinsPrevious
      ? joinsNext
        ? 'middle'
        : 'last'
      : joinsNext
        ? 'first'
        : 'single';
  }
  return items;
}

/** Timeline tylko z tekstu (kompatybilność wsteczna). */
export function buildChatTimeline<T extends TextMessage>(
  messages: readonly T[],
  locale: string,
  now: Date = new Date()
): ChatTimelineItem<T>[] {
  return withSeparators(messages, locale, now, (message) => ({
    type: 'text' as const,
    id: message.id,
    created_at: message.created_at,
    message,
  })) as ChatTimelineItem<T>[];
}

export type UnifiedChatTextMessage = TextMessage & {
  isSending?: boolean;
  sendFailed?: boolean;
};

/** Stable list keys: an outbox bubble keeps its key when the server copy replaces it. */
export function chatTextItemId(message: Pick<TextMessage, 'id' | 'client_message_id'>): string {
  return `text-${message.client_message_id ?? message.id}`;
}

export function chatMediaItemId(jobId: string): string {
  return `media-${jobId}`;
}

function toIso(ms: number): string {
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString();
}

/** Wspólna oś czasu: tekst + NiXy + wysyłane media (ASC). */
export function buildUnifiedChatTimeline<T extends UnifiedChatTextMessage = UnifiedChatTextMessage>(
  messages: readonly T[],
  nixes: readonly ChatNixEvent[],
  locale: string,
  now: Date = new Date(),
  uploadJobs: readonly DurableUploadJob[] = [],
  mediaAnchors: readonly ChatMediaAnchor[] = [],
  separatorLabels?: ChatSeparatorRelativeLabels
): ChatTimelineItem<T>[] {
  type Mixed =
    | { id: string; created_at: string; kind: 'text'; message: T }
    | { id: string; created_at: string; kind: 'nix'; nix: ChatNixEvent }
    | {
        id: string;
        created_at: string;
        kind: 'media';
        jobId: string;
        job: DurableUploadJob | null;
        nix: ChatNixEvent | null;
      };

  const sentNixByBatchId = new Map<string, ChatNixEvent>();
  for (const nix of nixes) {
    if (nix.direction === 'sent' && nix.client_upload_id) {
      sentNixByBatchId.set(nix.client_upload_id, nix);
    }
  }
  const anchorByBatchId = new Map(mediaAnchors.map((anchor) => [anchor.batchId, anchor]));
  const mergedNixIds = new Set<string>();
  const media: Mixed[] = [];
  const jobIds = new Set<string>();

  for (const job of uploadJobs) {
    jobIds.add(job.id);
    const nix = job.batchId ? (sentNixByBatchId.get(job.batchId) ?? null) : null;
    if (nix) mergedNixIds.add(nix.id);
    const anchor = job.batchId ? anchorByBatchId.get(job.batchId) : undefined;
    media.push({
      id: chatMediaItemId(job.id),
      created_at: toIso(anchor?.createdAt ?? job.createdAt),
      kind: 'media',
      jobId: job.id,
      job,
      nix,
    });
  }
  for (const anchor of mediaAnchors) {
    if (jobIds.has(anchor.jobId)) continue;
    const nix = sentNixByBatchId.get(anchor.batchId);
    // Without the server row the job simply left the queue (cancelled, expired): nothing to show.
    if (!nix || mergedNixIds.has(nix.id)) continue;
    mergedNixIds.add(nix.id);
    media.push({
      id: chatMediaItemId(anchor.jobId),
      created_at: toIso(anchor.createdAt),
      kind: 'media',
      jobId: anchor.jobId,
      job: null,
      nix,
    });
  }

  const mixed: Mixed[] = [
    ...messages.map((message) => ({
      id: chatTextItemId(message),
      created_at: message.created_at,
      kind: 'text' as const,
      message,
    })),
    ...nixes.flatMap((nix) =>
      mergedNixIds.has(nix.id)
        ? []
        : [{ id: `nix-${nix.id}`, created_at: nix.created_at, kind: 'nix' as const, nix }]
    ),
    ...media,
  ];

  return withSeparators(mixed, locale, now, (event) => {
    if (event.kind === 'text') {
      return { type: 'text', id: event.id, created_at: event.created_at, message: event.message };
    }
    if (event.kind === 'nix') {
      return { type: 'nix', id: event.id, created_at: event.created_at, nix: event.nix };
    }
    return {
      type: 'media',
      id: event.id,
      created_at: event.created_at,
      jobId: event.jobId,
      job: event.job,
      nix: event.nix,
    };
  }, separatorLabels) as ChatTimelineItem<T>[];
}

/**
 * The peer's public profile as already cached by the inbox bundle (DB-7). Used as the chat
 * header's `initialData`, so opening a chat from the inbox shows the name and avatar at once
 * instead of waiting for the profile request and only then for the signed avatar URL.
 */
export function chatPeerProfileFromInboxBundle(
  bundle: Pick<InboxBundle, 'inboxData' | 'sentData' | 'textMessagesData'> | undefined,
  peerId: string
): NixPublicProfile | undefined {
  if (!bundle || !peerId) return undefined;
  const profile =
    bundle.textMessagesData.find((message) => message.peer_id === peerId && message.peerProfile)
      ?.peerProfile ??
    bundle.inboxData.find((nix) => nix.sender_id === peerId && nix.sender)?.sender ??
    bundle.sentData.find((nix) => nix.receiver_id === peerId && nix.receiver)?.receiver;
  if (!profile?.username) return undefined;
  return {
    id: peerId,
    username: profile.username,
    display_name: profile.display_name ?? null,
    avatar_storage_path: profile.avatar_storage_path ?? null,
    avatar_emoji: profile.avatar_emoji ?? null,
  };
}

/** Server rows whose `expires_at` passed are gone server-side; hide them without waiting for sync. */
export function isTextMessageExpired(message: Pick<TextMessage, 'expires_at'>, nowMs: number): boolean {
  if (!message.expires_at) return false;
  const expiresAtMs = Date.parse(message.expires_at);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}
