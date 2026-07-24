import type { TextMessage } from '../types/database.types';
import type { ChatNixEvent } from '../services/nixService';

const SEPARATOR_GAP_MS = 60 * 60 * 1000;

export type ChatTimelineSeparator = {
  type: 'separator';
  id: string;
  label: string;
  created_at: string;
};

export type ChatTimelineText<T extends TextMessage = TextMessage> = {
  type: 'text';
  id: string;
  created_at: string;
  message: T;
};

export type ChatTimelineNix = {
  type: 'nix';
  id: string;
  created_at: string;
  nix: ChatNixEvent;
};

export type ChatTimelineItem<T extends TextMessage = TextMessage> =
  | ChatTimelineSeparator
  | ChatTimelineText<T>
  | ChatTimelineNix;

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

export function formatChatSeparatorLabel(
  input: string | Date,
  locale: string,
  now: Date = new Date()
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return '';

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return getCachedDateTimeFormat(locale, TIME_ONLY_OPTIONS).format(date);
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
  mapEvent: (event: T) => Exclude<ChatTimelineItem, ChatTimelineSeparator>
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
        label: formatChatSeparatorLabel(event.created_at, locale, now),
        created_at: event.created_at,
      });
    }

    items.push(mapEvent(event));
    lastStamp = validStamp;
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

/** Wspólna oś czasu: tekst + NiXy (ASC). */
export function buildUnifiedChatTimeline(
  messages: readonly UnifiedChatTextMessage[],
  nixes: readonly ChatNixEvent[],
  locale: string,
  now: Date = new Date()
): ChatTimelineItem<UnifiedChatTextMessage>[] {
  type Mixed =
    | { id: string; created_at: string; kind: 'text'; message: UnifiedChatTextMessage }
    | { id: string; created_at: string; kind: 'nix'; nix: ChatNixEvent };

  const mixed: Mixed[] = [
    ...messages.map((message) => ({
      id: `text-${message.id}`,
      created_at: message.created_at,
      kind: 'text' as const,
      message,
    })),
    ...nixes.map((nix) => ({
      id: `nix-${nix.id}`,
      created_at: nix.created_at,
      kind: 'nix' as const,
      nix,
    })),
  ];

  return withSeparators(mixed, locale, now, (event) =>
    event.kind === 'text'
      ? {
          type: 'text',
          id: event.message.id,
          created_at: event.message.created_at,
          message: event.message,
        }
      : {
          type: 'nix',
          id: event.nix.id,
          created_at: event.nix.created_at,
          nix: event.nix,
        }
  );
}
