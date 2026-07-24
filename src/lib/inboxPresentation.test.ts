import { describe, expect, it } from 'vitest';
import type { InboxNix, SentNix } from '../services/nixService';
import type { InboxThreadItem } from './inboxThreads';
import {
  buildInboxRowModel,
  formatInboxTimestamp,
  resolveSentInboxStatus,
} from './inboxPresentation';

function receivedItem(nix: Partial<InboxNix> = {}): InboxThreadItem {
  return {
    id: 'received-nix-1',
    kind: 'nix',
    direction: 'received',
    timestamp: 1,
    nix: {
      id: 'nix-1',
      sender_id: 'friend-1',
      media_path: 'media/photo.jpg',
      created_at: new Date(2026, 6, 14, 9, 5).toISOString(),
      is_viewed: false,
      media_type: 'image',
      playback_duration_ms: null,
      view_duration_sec: 5,
      status: 'sent',
      sender: null,
      ...nix,
    },
  };
}

function sentNix(partial: Partial<SentNix> = {}): SentNix {
  return {
    id: 'sent-1',
    receiver_id: 'friend-2',
    created_at: new Date(2026, 6, 14, 8, 0).toISOString(),
    status: 'sent',
    viewed_at: null,
    cleaned_at: null,
    receiver: null,
    ...partial,
  };
}

function sentItem(nix: Partial<SentNix> = {}): InboxThreadItem {
  return {
    id: 'sent-nix-1',
    kind: 'nix',
    direction: 'sent',
    timestamp: 1,
    nix: sentNix(nix),
  };
}

const presentationOptions = {
  unknownUsername: 'Nieznany',
  locale: 'pl',
  yesterdayLabel: 'Wczoraj',
  now: new Date(2026, 6, 14, 12, 0),
};

describe('resolveSentInboxStatus', () => {
  it('zwraca tylko najważniejszy aktualny status', () => {
    expect(resolveSentInboxStatus(sentNix())).toBe('sent');
    expect(resolveSentInboxStatus(sentNix({ status: 'viewed' }))).toBe('opened');
    expect(
      resolveSentInboxStatus(
        sentNix({ status: 'cleaned', viewed_at: '2026-07-14T08:00:00.000Z' })
      )
    ).toBe('cleaned');
  });

  it('nadaje błędowi czyszczenia pierwszeństwo przed historią otwarcia', () => {
    expect(
      resolveSentInboxStatus(
        sentNix({ status: 'cleanup_failed', viewed_at: '2026-07-14T08:00:00.000Z' })
      )
    ).toBe('cleanupFailed');
  });

  it('rozpoznaje cleaned_at i viewed_at także przy starszym statusie', () => {
    expect(resolveSentInboxStatus(sentNix({ cleaned_at: '2026-07-14T08:00:00.000Z' }))).toBe(
      'cleaned'
    );
    expect(resolveSentInboxStatus(sentNix({ viewed_at: '2026-07-14T08:00:00.000Z' }))).toBe(
      'opened'
    );
  });
});

describe('buildInboxRowModel', () => {
  it('mapuje nieprzeczytaną wiadomość, awatar i parametry otwarcia', () => {
    const row = buildInboxRowModel(
      receivedItem({
        sender: {
          username: 'ania',
          avatar_storage_path: 'avatars/ania.jpg',
          avatar_emoji: '🌿',
        },
      }),
      presentationOptions
    );

    expect(row).toMatchObject({
      peerId: 'friend-1',
      username: 'ania',
      direction: 'received',
      unread: true,
      status: 'new',
      mediaType: 'image',
      avatarStoragePath: 'avatars/ania.jpg',
      avatarEmoji: '🌿',
      openParams: {
        id: 'nix-1',
        path: 'media/photo.jpg',
        senderId: 'friend-1',
      },
    });
  });

  it('mapuje wideo jako mediaType video', () => {
    const row = buildInboxRowModel(receivedItem({ media_type: 'video' }), presentationOptions);
    expect(row.mediaType).toBe('video');
  });

  it('mapuje wiadomość tekstową bez treści w podglądzie', () => {
    const row = buildInboxRowModel(
      {
        id: 'text-1',
        kind: 'text',
        direction: 'received',
        timestamp: 1,
        textMessage: {
          id: 'tm-1',
          peer_id: 'friend-1',
          sender_id: 'friend-1',
          receiver_id: 'me',
          body: 'tajna treść',
          created_at: new Date(2026, 6, 14, 9, 5).toISOString(),
          expires_at: new Date(2026, 6, 15, 9, 5).toISOString(),
          client_message_id: null,
        },
        peerProfile: { username: 'ania', avatar_storage_path: null, avatar_emoji: null },
      },
      presentationOptions
    );

    expect(row).toMatchObject({
      kind: 'text',
      peerId: 'friend-1',
      mediaType: null,
      unread: false,
    });
  });

  it('nie pozwala ponownie otworzyć przeczytanej wiadomości', () => {
    const row = buildInboxRowModel(receivedItem({ is_viewed: true }), presentationOptions);
    expect(row.status).toBe('opened');
    expect(row.unread).toBe(false);
    expect(row.openParams).toBeNull();
  });

  it('mapuje odbiorcę wysłanej wiadomości i używa fallbacku nazwy', () => {
    const sentRow = buildInboxRowModel(
      sentItem({
        status: 'viewed',
        receiver: { username: 'ola', avatar_storage_path: null, avatar_emoji: '🐕' },
      }),
      presentationOptions
    );
    const fallbackRow = buildInboxRowModel(sentItem(), presentationOptions);

    expect(sentRow).toMatchObject({
      username: 'ola',
      direction: 'sent',
      status: 'opened',
      mediaType: null,
      avatarEmoji: '🐕',
      openParams: null,
    });
    expect(fallbackRow.username).toBe('Nieznany');
  });
});

describe('formatInboxTimestamp', () => {
  const now = new Date(2026, 6, 14, 12, 0);

  it('pokazuje godzinę dla dzisiejszej wiadomości', () => {
    const date = new Date(2026, 6, 14, 9, 5);
    expect(
      formatInboxTimestamp(date, 'pl', { now, yesterdayLabel: 'Wczoraj' })
    ).toBe(new Intl.DateTimeFormat('pl', { hour: '2-digit', minute: '2-digit' }).format(date));
  });

  it('używa lokalizowanej etykiety wczoraj po polsku i angielsku', () => {
    const date = new Date(2026, 6, 13, 20, 0);
    expect(formatInboxTimestamp(date, 'pl', { now, yesterdayLabel: 'Wczoraj' })).toBe(
      'Wczoraj'
    );
    expect(formatInboxTimestamp(date, 'en', { now, yesterdayLabel: 'Yesterday' })).toBe(
      'Yesterday'
    );
  });

  it('pokazuje dzień tygodnia, później datę i rok tylko gdy jest potrzebny', () => {
    const recent = new Date(2026, 6, 10, 9, 0);
    const older = new Date(2026, 5, 10, 9, 0);
    const previousYear = new Date(2025, 11, 10, 9, 0);

    expect(formatInboxTimestamp(recent, 'pl', { now, yesterdayLabel: 'Wczoraj' })).toBe(
      new Intl.DateTimeFormat('pl', { weekday: 'short' }).format(recent)
    );
    expect(formatInboxTimestamp(older, 'pl', { now, yesterdayLabel: 'Wczoraj' })).toBe(
      new Intl.DateTimeFormat('pl', { day: 'numeric', month: 'short' }).format(older)
    );
    expect(
      formatInboxTimestamp(previousYear, 'en', { now, yesterdayLabel: 'Yesterday' })
    ).toBe(
      new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(previousYear)
    );
  });

  it('zwraca pustą etykietę dla nieprawidłowej daty', () => {
    expect(
      formatInboxTimestamp('not-a-date', 'pl', { now, yesterdayLabel: 'Wczoraj' })
    ).toBe('');
  });
});
