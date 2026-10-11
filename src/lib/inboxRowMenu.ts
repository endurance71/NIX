/**
 * Inbox row actions (context menu + swipe) and accessibility copy — pure, so the rules are tested
 * without SwiftUI.
 */
import type { InboxRowModel, RecipientUploadPhase } from './inboxPresentation';

export type ConversationMuteDuration = '1h' | '24h' | 'forever';

export type ConversationMuteEntry = {
  peer_user_id: string;
  muted_until: string | null;
};

/** A mute without an end date is indefinite; one whose end passed no longer counts. */
export function activeConversationMutePeerIds(
  mutes: readonly ConversationMuteEntry[],
  now: number,
): string[] {
  return mutes
    .filter((mute) => {
      if (!mute.muted_until) return true;
      const until = Date.parse(mute.muted_until);
      return Number.isFinite(until) && until > now;
    })
    .map((mute) => mute.peer_user_id);
}

export type InboxRowMenu = {
  /** Pin / Unpin. */
  pin: boolean;
  /** Mute (1h / 24h / always) or Unmute. Behind the communication-controls rollout flag. */
  mute: boolean;
  /** Only for a text conversation with unread incoming messages. */
  markRead: boolean;
  report: boolean;
  block: boolean;
  delete: boolean;
};

export const EMPTY_INBOX_ROW_MENU: InboxRowMenu = {
  pin: false,
  mute: false,
  markRead: false,
  report: false,
  block: false,
  delete: false,
};

export function resolveInboxRowMenu({
  row,
  busy,
  online,
  muteAvailable,
}: {
  row: Pick<InboxRowModel, 'kind' | 'direction' | 'unread' | 'upload'>;
  busy: boolean;
  online: boolean;
  muteAvailable: boolean;
}): InboxRowMenu {
  // Every action writes to the server; offline or mid-action the row has no menu at all.
  if (busy || !online) return EMPTY_INBOX_ROW_MENU;
  return {
    pin: true,
    mute: muteAvailable,
    markRead: row.kind === 'text' && row.direction === 'received' && row.unread && !row.upload,
    report: true,
    block: true,
    delete: true,
  };
}

export function hasInboxRowMenu(menu: InboxRowMenu): boolean {
  return Object.values(menu).some(Boolean);
}

/**
 * Passive upload states (waiting for the network, paused by the user) are gray; blue is reserved
 * for work that is actually happening.
 */
export type UploadPhaseTone = 'active' | 'passive' | 'danger' | 'success';

export function uploadPhaseTone(phase: RecipientUploadPhase): UploadPhaseTone {
  switch (phase) {
    case 'failed':
      return 'danger';
    case 'completed':
    // Uploaded and waiting for moderation: shown as sent; only a problem surfaces later.
    case 'confirming':
      return 'success';
    case 'waiting_network':
    case 'paused':
      return 'passive';
    case 'preparing':
    case 'uploading':
    case 'retry_scheduled':
      return 'active';
  }
}

/**
 * VoiceOver label: the visible name first (Voice Control matches on it), then unread, muted and
 * pinned state, the status line and the time — the same facts a sighted user reads off the row.
 */
export function buildInboxRowAccessibilityLabel({
  name,
  friendshipLabel = null,
  unreadLabel,
  pinnedLabel,
  mutedLabel,
  status,
  timestamp,
}: {
  name: string;
  /** Spoken streak / best-friend badge („seria 12 dni”), right after the name it decorates. */
  friendshipLabel?: string | null;
  unreadLabel: string | null;
  pinnedLabel: string | null;
  mutedLabel: string | null;
  status: string;
  timestamp: string;
}): string {
  return [name, friendshipLabel, unreadLabel, pinnedLabel, mutedLabel, status, timestamp]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}
