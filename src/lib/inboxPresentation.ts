import type { InboxThreadItem } from './inboxThreads';
import type { SentNix } from '../services/nixService';
import type { SupportedLocale } from './i18n';
import type { ViewerOpenParams } from './viewerRoute';

export type InboxRowStatus = 'new' | 'sent' | 'opened' | 'cleaned' | 'cleanupFailed';

export type InboxRowMediaType = 'image' | 'video';

export type RecipientUploadPhase =
  | 'preparing'
  | 'uploading'
  | 'waiting_network'
  | 'retry_scheduled'
  | 'paused'
  | 'failed'
  | 'completed';

export type RecipientUploadPresentation = {
  phase: RecipientUploadPhase;
  progress: number;
  jobIds: string[];
  jobCount: number;
  sharedRecipientCount: number;
  createdAt: number;
  updatedAt: number;
  mediaType: InboxRowMediaType;
  actions: {
    pauseJobIds: string[];
    resumeJobIds: string[];
    retryJobIds: string[];
    cancelJobIds: string[];
  };
};

export type UploadRowAction = 'pause' | 'resume' | 'retry' | 'cancel';

export type InboxRowModel = {
  id: string;
  peerId: string;
  kind: 'nix' | 'text';
  username: string;
  display_name?: string | null;
  direction: 'received' | 'sent';
  unread: boolean;
  status: InboxRowStatus;
  createdAt: string;
  timestampLabel: string;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  /** Typ mediów NiXa; `null` dla wiadomości tekstowych i wysłanych (status zamiast typu). */
  mediaType: InboxRowMediaType | null;
  upload: RecipientUploadPresentation | null;
  openParams: ViewerOpenParams | null;
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
  if (item.kind === 'text') {
    const { textMessage, peerProfile } = item;
    const username = peerProfile?.username || unknownUsername;
    const displayName = peerProfile?.display_name || null;

    return {
      id: item.id,
      peerId: textMessage.peer_id,
      kind: 'text',
      username,
      display_name: displayName,
      direction: item.direction,
      unread: textMessage.is_unread === true,
      status: item.direction === 'received' ? 'opened' : 'sent',
      createdAt: textMessage.created_at,
      timestampLabel: formatInboxTimestamp(textMessage.created_at, locale, { now, yesterdayLabel }),
      avatarStoragePath: peerProfile?.avatar_storage_path ?? null,
      avatarEmoji: peerProfile?.avatar_emoji ?? null,
      mediaType: null,
      upload: null,
      openParams: null,
    };
  }

  if (item.direction === 'received') {
    const { nix } = item;
    const unread = nix.is_viewed !== true;
    const username = nix.sender?.username || unknownUsername;
    const displayName = nix.sender?.display_name || null;

    return {
      id: item.id,
      peerId: nix.sender_id,
      kind: 'nix',
      username,
      display_name: displayName,
      direction: 'received',
      unread,
      status: unread ? 'new' : 'opened',
      createdAt: nix.created_at,
      timestampLabel: formatInboxTimestamp(nix.created_at, locale, { now, yesterdayLabel }),
      avatarStoragePath: nix.sender?.avatar_storage_path ?? null,
      avatarEmoji: nix.sender?.avatar_emoji ?? null,
      mediaType: nix.media_type === 'video' ? 'video' : 'image',
      upload: null,
      openParams: unread
        ? {
            id: nix.id,
            path: nix.media_path,
            senderId: nix.sender_id,
            mediaType: nix.media_type === 'video' ? 'video' : 'image',
            viewDurationSec: nix.view_duration_sec,
            playbackDurationMs: nix.playback_duration_ms ?? null,
            thumbnailB64: nix.thumbnail_b64 ?? null,
            isReplay: false,
          }
        : null,
    };
  }

  const { nix } = item;
  const username = nix.receiver?.username || unknownUsername;
  const displayName = nix.receiver?.display_name || null;
  return {
    id: item.id,
    peerId: nix.receiver_id,
    kind: 'nix',
    username,
    display_name: displayName,
    direction: 'sent',
    unread: false,
    status: resolveSentInboxStatus(nix),
    createdAt: nix.created_at,
    timestampLabel: formatInboxTimestamp(nix.created_at, locale, { now, yesterdayLabel }),
    avatarStoragePath: nix.receiver?.avatar_storage_path ?? null,
    avatarEmoji: nix.receiver?.avatar_emoji ?? null,
    mediaType: null,
    upload: null,
    openParams: null,
  };
}

type InboxTimestampOptions = {
  now?: Date;
  yesterdayLabel: string;
};

type InboxDateFormatterKind = 'time' | 'weekday' | 'date' | 'dateWithYear';
const inboxDateFormatters: Record<
  SupportedLocale,
  Record<InboxDateFormatterKind, Intl.DateTimeFormat>
> = {
  pl: {
    time: new Intl.DateTimeFormat('pl', { hour: '2-digit', minute: '2-digit' }),
    weekday: new Intl.DateTimeFormat('pl', { weekday: 'short' }),
    date: new Intl.DateTimeFormat('pl', { day: 'numeric', month: 'short' }),
    dateWithYear: new Intl.DateTimeFormat('pl', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  },
  en: {
    time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }),
    weekday: new Intl.DateTimeFormat('en', { weekday: 'short' }),
    date: new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }),
    dateWithYear: new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  },
};

function getInboxDateFormatter(locale: string, kind: InboxDateFormatterKind) {
  const supportedLocale: SupportedLocale = locale.toLowerCase().startsWith('pl') ? 'pl' : 'en';
  return inboxDateFormatters[supportedLocale][kind];
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
