import { describe, expect, it } from 'vitest';
import {
  EMPTY_INBOX_ROW_MENU,
  activeConversationMutePeerIds,
  buildInboxRowAccessibilityLabel,
  hasInboxRowMenu,
  resolveInboxRowMenu,
  uploadPhaseTone,
} from './inboxRowMenu';

const textRow = { kind: 'text' as const, direction: 'received' as const, unread: true, upload: null };

describe('resolveInboxRowMenu', () => {
  it('offers mark-as-read only for unread incoming text conversations', () => {
    expect(resolveInboxRowMenu({ row: textRow, busy: false, online: true, muteAvailable: true }).markRead).toBe(true);
    expect(
      resolveInboxRowMenu({ row: { ...textRow, unread: false }, busy: false, online: true, muteAvailable: true })
        .markRead,
    ).toBe(false);
    expect(
      resolveInboxRowMenu({ row: { ...textRow, kind: 'nix' }, busy: false, online: true, muteAvailable: true })
        .markRead,
    ).toBe(false);
    expect(
      resolveInboxRowMenu({ row: { ...textRow, direction: 'sent' }, busy: false, online: true, muteAvailable: true })
        .markRead,
    ).toBe(false);
  });

  it('hides mute behind the rollout flag', () => {
    expect(resolveInboxRowMenu({ row: textRow, busy: false, online: true, muteAvailable: false }).mute).toBe(false);
    expect(resolveInboxRowMenu({ row: textRow, busy: false, online: true, muteAvailable: true }).mute).toBe(true);
  });

  it('has no menu offline or while the row is busy', () => {
    expect(resolveInboxRowMenu({ row: textRow, busy: false, online: false, muteAvailable: true })).toBe(
      EMPTY_INBOX_ROW_MENU,
    );
    expect(resolveInboxRowMenu({ row: textRow, busy: true, online: true, muteAvailable: true })).toBe(
      EMPTY_INBOX_ROW_MENU,
    );
    expect(hasInboxRowMenu(EMPTY_INBOX_ROW_MENU)).toBe(false);
    expect(hasInboxRowMenu(resolveInboxRowMenu({ row: textRow, busy: false, online: true, muteAvailable: false }))).toBe(
      true,
    );
  });
});

describe('activeConversationMutePeerIds', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  it('keeps indefinite and future mutes, drops expired ones', () => {
    expect(
      activeConversationMutePeerIds(
        [
          { peer_user_id: 'forever', muted_until: null },
          { peer_user_id: 'future', muted_until: '2026-10-10T13:00:00Z' },
          { peer_user_id: 'past', muted_until: '2026-10-10T11:00:00Z' },
          { peer_user_id: 'broken', muted_until: 'not a date' },
        ],
        now,
      ),
    ).toEqual(['forever', 'future']);
  });
});

describe('uploadPhaseTone', () => {
  it('grays out passive states and keeps blue for active work', () => {
    expect(uploadPhaseTone('waiting_network')).toBe('passive');
    expect(uploadPhaseTone('paused')).toBe('passive');
    expect(uploadPhaseTone('uploading')).toBe('active');
    expect(uploadPhaseTone('retry_scheduled')).toBe('active');
    expect(uploadPhaseTone('failed')).toBe('danger');
    expect(uploadPhaseTone('completed')).toBe('success');
  });
});

describe('buildInboxRowAccessibilityLabel', () => {
  it('reads name, unread, pinned and muted state, status and time in order', () => {
    expect(
      buildInboxRowAccessibilityLabel({
        name: 'Ola',
        unreadLabel: 'nieprzeczytane',
        pinnedLabel: 'przypięte',
        mutedLabel: null,
        status: 'Nowa wiadomość',
        timestamp: '12:30',
      }),
    ).toBe('Ola, nieprzeczytane, przypięte, Nowa wiadomość, 12:30');
  });

  it('reads the friendship badge right after the name', () => {
    expect(
      buildInboxRowAccessibilityLabel({
        name: 'Ola',
        friendshipLabel: 'seria 12 dni',
        unreadLabel: null,
        pinnedLabel: null,
        mutedLabel: null,
        status: 'Otwarto',
        timestamp: '12:30',
      }),
    ).toBe('Ola, seria 12 dni, Otwarto, 12:30');
  });
});
