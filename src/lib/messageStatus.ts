import type { AppIconName } from '../theme/app-icons';
import type { ThemeColors } from '../theme/colors';

/**
 * One status vocabulary for the inbox and the chat, modelled on Snapchat:
 * what I sent goes Sending → Sent → Delivered → Opened → Replayed, what I got is
 * New NiX / New message until I open it, then Received.
 */
export type MessageKind = 'photo' | 'video' | 'text';

export type MessageStatus =
  | 'sending'
  | 'waitingNetwork'
  | 'failed'
  | 'expired'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'replayed'
  | 'newNix'
  | 'newMessage'
  | 'received';

/** Server fields of a NiX that carry its status (all optional: older backends omit some). */
export type NixStatusFields = {
  status?: 'sent' | 'viewed' | 'cleaned' | 'cleanup_failed' | null;
  is_viewed?: boolean | null;
  viewed_at?: string | null;
  is_replayed?: boolean | null;
  replay_expires_at?: string | null;
  replayed_at?: string | null;
  unplayable_at?: string | null;
};

/** A NiX I sent that already exists on the server (so it reached the receiver's inbox). */
export function outgoingNixStatus(nix: NixStatusFields): 'delivered' | 'opened' | 'replayed' {
  // The receiver's viewer could not load it: they never saw it.
  if (nix.unplayable_at) return 'delivered';
  if (nix.replayed_at) return 'replayed';
  // Backends without replayed_at: a real replay keeps its window, while the unplayable path
  // clears it.
  if (nix.replayed_at === undefined && nix.is_replayed && nix.replay_expires_at) return 'replayed';
  if (
    nix.is_viewed ||
    nix.viewed_at ||
    nix.status === 'viewed' ||
    nix.status === 'cleaned' ||
    nix.status === 'cleanup_failed'
  ) {
    return 'opened';
  }
  return 'delivered';
}

/** A text I sent that the server stored. */
export function outgoingTextStatus(message: { read_at?: string | null }): 'delivered' | 'opened' {
  return message.read_at ? 'opened' : 'delivered';
}

export function incomingNixStatus(nix: { is_viewed?: boolean | null }): 'newNix' | 'received' {
  return nix.is_viewed ? 'received' : 'newNix';
}

export function incomingTextStatus(unread: boolean): 'newMessage' | 'received' {
  return unread ? 'newMessage' : 'received';
}

/** Local text outbox → status (see chatOutboxMessages). */
export function outboxTextStatus(
  outbox: 'sending' | 'waiting_network' | 'failed' | 'expired'
): MessageStatus {
  if (outbox === 'waiting_network') return 'waitingNetwork';
  return outbox;
}

export function messageKindForMedia(mediaType: string | null | undefined): MessageKind {
  return mediaType === 'video' ? 'video' : 'photo';
}

export type MessageStatusPresentation = {
  labelKey: `messageStatus.${MessageStatus}`;
  icon: AppIconName;
  /** `accent`: the user's accent colour; `muted`: secondary label; `danger`: destructive. */
  tone: 'accent' | 'muted' | 'danger';
  /** Unread incoming items are emphasised, like Snapchat's bold "New Snap". */
  emphasized: boolean;
};

const KIND_ICONS: Record<MessageKind, { filled: AppIconName; opened: AppIconName }> = {
  photo: { filled: 'statusPhoto', opened: 'statusPhotoOpened' },
  video: { filled: 'statusVideo', opened: 'statusVideoOpened' },
  text: { filled: 'statusText', opened: 'statusTextOpened' },
};

/**
 * The symbol carries the kind (photo, video, text) and whether it was opened (filled until it
 * is); the colour is the user's accent.
 */
export function messageStatusPresentation(
  status: MessageStatus,
  kind: MessageKind
): MessageStatusPresentation {
  const labelKey = `messageStatus.${status}` as const;
  // Rows restored from an older offline cache may lack the kind: fall back to the photo symbol.
  const icons = KIND_ICONS[kind] ?? KIND_ICONS.photo;
  switch (status) {
    case 'sending':
    case 'waitingNetwork':
      return { labelKey, icon: 'clock', tone: 'muted', emphasized: false };
    case 'failed':
    case 'expired':
      return { labelKey, icon: 'statusFailed', tone: 'danger', emphasized: false };
    case 'sent':
      return { labelKey, icon: icons.filled, tone: 'muted', emphasized: false };
    case 'delivered':
      return { labelKey, icon: icons.filled, tone: 'accent', emphasized: false };
    case 'opened':
    case 'received':
      return { labelKey, icon: icons.opened, tone: 'accent', emphasized: false };
    case 'replayed':
      return { labelKey, icon: 'statusReplayed', tone: 'accent', emphasized: false };
    case 'newNix':
    case 'newMessage':
      return { labelKey, icon: icons.filled, tone: 'accent', emphasized: true };
  }
}

export function messageStatusColor(
  tone: MessageStatusPresentation['tone'],
  colors: Pick<ThemeColors, 'accent' | 'secondaryLabel' | 'destructive'>
): string {
  if (tone === 'muted') return colors.secondaryLabel;
  if (tone === 'danger') return colors.destructive;
  return colors.accent;
}
