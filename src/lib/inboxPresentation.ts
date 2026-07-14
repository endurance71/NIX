import type { InboxThreadItem } from './inboxThreads';
import type { SentNix } from '../services/nixService';

export type InboxRowStatus = 'new' | 'sent' | 'opened' | 'cleaned' | 'cleanupFailed';

export type InboxRowModel = {
  id: string;
  peerId: string;
  username: string;
  direction: 'received' | 'sent';
  unread: boolean;
  status: InboxRowStatus;
  createdAt: string;
  timestampLabel: string;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  openParams: {
    id: string;
    path: string;
    senderId: string;
  } | null;
};

export function resolveSentInboxStatus(
  sent: Pick<SentNix, 'status' | 'viewed_at' | 'cleaned_at'>
): Exclude<InboxRowStatus, 'new'> {
  if (sent.status === 'cleanup_failed') return 'cleanupFailed';
  if (sent.status === 'cleaned' || Boolean(sent.cleaned_at)) return 'cleaned';
  if (sent.status === 'viewed' || Boolean(sent.viewed_at)) return 'opened';
  return 'sent';
}

type InboxRowModelOptions = {
  unknownUsername: string;
  locale: string;
  yesterdayLabel: string;
  now?: Date;
};

export function buildInboxRowModel(
  item: InboxThreadItem,
  { unknownUsername, locale, yesterdayLabel, now }: InboxRowModelOptions
): InboxRowModel {
  if (item.direction === 'received') {
    const { nix } = item;
    const unread = nix.is_viewed !== true;
    const username = nix.sender?.username || unknownUsername;

    return {
      id: item.id,
      peerId: nix.sender_id,
      username,
      direction: 'received',
      unread,
      status: unread ? 'new' : 'opened',
      createdAt: nix.created_at,
      timestampLabel: formatInboxTimestamp(nix.created_at, locale, { now, yesterdayLabel }),
      avatarStoragePath: nix.sender?.avatar_storage_path ?? null,
      avatarEmoji: nix.sender?.avatar_emoji ?? null,
      openParams: unread
        ? {
            id: nix.id,
            path: nix.media_path,
            senderId: nix.sender_id,
          }
        : null,
    };
  }

  const { nix } = item;
  const username = nix.receiver?.username || unknownUsername;
  return {
    id: item.id,
    peerId: nix.receiver_id,
    username,
    direction: 'sent',
    unread: false,
    status: resolveSentInboxStatus(nix),
    createdAt: nix.created_at,
    timestampLabel: formatInboxTimestamp(nix.created_at, locale, { now, yesterdayLabel }),
    avatarStoragePath: nix.receiver?.avatar_storage_path ?? null,
    avatarEmoji: nix.receiver?.avatar_emoji ?? null,
    openParams: null,
  };
}

type InboxTimestampOptions = {
  now?: Date;
  yesterdayLabel: string;
};

type InboxDateFormatterKind = 'time' | 'weekday' | 'date' | 'dateWithYear';
const inboxDateFormatters = new Map<string, Intl.DateTimeFormat>();

function getInboxDateFormatter(locale: string, kind: InboxDateFormatterKind) {
  const key = `${locale}:${kind}`;
  const cached = inboxDateFormatters.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions =
    kind === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : kind === 'weekday'
        ? { weekday: 'short' }
        : kind === 'date'
          ? { day: 'numeric', month: 'short' }
          : { day: 'numeric', month: 'short', year: 'numeric' };
  const formatter = new Intl.DateTimeFormat(locale, options);
  inboxDateFormatters.set(key, formatter);
  return formatter;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatInboxTimestamp(
  input: string | Date,
  locale: string,
  { now = new Date(), yesterdayLabel }: InboxTimestampOptions
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return '';

  const inputDay = startOfLocalDay(date);
  const currentDay = startOfLocalDay(now);
  const dayDifference = Math.round((currentDay.getTime() - inputDay.getTime()) / 86_400_000);

  if (dayDifference <= 0) {
    return getInboxDateFormatter(locale, 'time').format(date);
  }

  if (dayDifference === 1) return yesterdayLabel;

  if (dayDifference < 7) {
    return getInboxDateFormatter(locale, 'weekday').format(date);
  }

  if (date.getFullYear() === now.getFullYear()) {
    return getInboxDateFormatter(locale, 'date').format(date);
  }

  return getInboxDateFormatter(locale, 'dateWithYear').format(date);
}
