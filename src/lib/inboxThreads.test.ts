import { describe, expect, it } from 'vitest';
import { buildInboxThreads } from './inboxThreads';
import type { InboxNix, SentNix } from '../services/nixService';

function inbox(partial: Partial<InboxNix> & Pick<InboxNix, 'id' | 'sender_id' | 'created_at'>): InboxNix {
  return {
    media_path: 'nix.jpg',
    is_viewed: false,
    media_type: 'image',
    playback_duration_ms: null,
    view_duration_sec: 5,
    status: 'sent',
    sender: null,
    ...partial,
  };
}

function sent(partial: Partial<SentNix> & Pick<SentNix, 'id' | 'receiver_id' | 'created_at'>): SentNix {
  return {
    status: 'sent',
    viewed_at: null,
    cleaned_at: null,
    receiver: null,
    ...partial,
  };
}

describe('buildInboxThreads', () => {
  it('sortuje rozmowy malejąco po czasie', () => {
    const threads = buildInboxThreads(
      [
        inbox({ id: 'old', sender_id: 'a', created_at: '2026-05-01T10:00:00Z', is_viewed: true }),
        inbox({ id: 'new', sender_id: 'b', created_at: '2026-05-01T12:00:00Z', is_viewed: true }),
      ],
      []
    );

    expect(threads.map((item) => (item.kind === 'nix' ? item.nix.id : item.textMessage.id))).toEqual([
      'new',
      'old',
    ]);
  });

  it('pokazuje najnowszy nieprzeczytany odebrany nix przed nowszym wysłanym do tej samej osoby', () => {
    const threads = buildInboxThreads(
      [inbox({ id: 'unread', sender_id: 'friend', created_at: '2026-05-01T10:00:00Z', is_viewed: false })],
      [sent({ id: 'sent-later', receiver_id: 'friend', created_at: '2026-05-01T11:00:00Z' })]
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].direction).toBe('received');
    expect(threads[0].kind).toBe('nix');
    if (threads[0].kind === 'nix') {
      expect(threads[0].nix.id).toBe('unread');
    }
  });

  it('łączy wysłane i odebrane po rozmówcy oraz zachowuje avatar path w nixie', () => {
    const threads = buildInboxThreads(
      [
        inbox({
          id: 'read',
          sender_id: 'friend',
          created_at: '2026-05-01T09:00:00Z',
          is_viewed: true,
          sender: { username: 'friend', avatar_storage_path: 'a.png', avatar_emoji: null },
        }),
      ],
      [sent({ id: 'latest', receiver_id: 'friend', created_at: '2026-05-01T12:00:00Z' })]
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].direction).toBe('sent');
    expect(threads[0].kind).toBe('nix');
    if (threads[0].kind === 'nix') {
      expect(threads[0].nix.id).toBe('latest');
    }
  });

  it('zwraca pustą listę dla pustych danych', () => {
    expect(buildInboxThreads([], [])).toEqual([]);
  });

  it('nie zwraca rozmówcy, gdy po usunięciu brak nixów dla peera', () => {
    const beforeDelete = buildInboxThreads(
      [inbox({ id: 'r1', sender_id: 'friend-a', created_at: '2026-05-01T10:00:00Z' })],
      [sent({ id: 's1', receiver_id: 'friend-b', created_at: '2026-05-01T11:00:00Z' })]
    );
    expect(beforeDelete.map((item) => item.kind === 'nix' ? (item.direction === 'received' ? item.nix.sender_id : item.nix.receiver_id) : item.textMessage.peer_id)).toEqual([
      'friend-b',
      'friend-a',
    ]);

    const afterDelete = buildInboxThreads([], [sent({ id: 's1', receiver_id: 'friend-b', created_at: '2026-05-01T11:00:00Z' })]);
    expect(afterDelete.map((item) => item.kind === 'nix' ? (item.direction === 'received' ? item.nix.sender_id : item.nix.receiver_id) : item.textMessage.peer_id)).toEqual([
      'friend-b',
    ]);
  });

  it('poprawnie wyznacza najnowszą aktywność gdy wiadomość tekstowa jest nowsza od NiXa', () => {
    const threads = buildInboxThreads(
      [
        inbox({
          id: 'old-nix',
          sender_id: 'peer-1',
          created_at: '2026-05-01T10:00:00Z',
          is_viewed: true,
          sender: { username: 'alice', avatar_storage_path: null, avatar_emoji: null },
        }),
      ],
      [],
      [
        {
          id: 'text-1',
          sender_id: 'peer-1',
          receiver_id: 'me',
          body: 'Cześć!',
          created_at: '2026-05-01T11:00:00Z',
          expires_at: '2026-05-02T11:00:00Z',
          client_message_id: null,
          peer_id: 'peer-1',
        },
      ]
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].kind).toBe('text');
    if (threads[0].kind === 'text') {
      expect(threads[0].textMessage.body).toBe('Cześć!');
      expect(threads[0].peerProfile?.username).toBe('alice');
    }
  });

  it('przekazuje peerProfile z bundla tekstowego', () => {
    const threads = buildInboxThreads(
      [],
      [],
      [
        {
          id: 'text-1',
          sender_id: 'peer-1',
          receiver_id: 'me',
          body: 'Hej',
          created_at: '2026-05-01T11:00:00Z',
          expires_at: '2026-05-02T11:00:00Z',
          client_message_id: null,
          peer_id: 'peer-1',
          peerProfile: {
            username: 'bob',
            display_name: 'Bob',
            avatar_storage_path: null,
            avatar_emoji: null,
          },
        },
      ]
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].kind).toBe('text');
    if (threads[0].kind === 'text') {
      expect(threads[0].peerProfile?.username).toBe('bob');
    }
  });
});
