import { describe, expect, it } from 'vitest';
import { buildInboxThreads } from './inboxThreads';
import type { InboxSnap, SentSnap } from '../services/snapService';

function inbox(partial: Partial<InboxSnap> & Pick<InboxSnap, 'id' | 'sender_id' | 'created_at'>): InboxSnap {
  return {
    media_path: 'snap.jpg',
    is_viewed: false,
    media_type: 'image',
    playback_duration_ms: null,
    view_duration_sec: 5,
    status: 'sent',
    sender: null,
    ...partial,
  };
}

function sent(partial: Partial<SentSnap> & Pick<SentSnap, 'id' | 'receiver_id' | 'created_at'>): SentSnap {
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

    expect(threads.map((item) => item.snap.id)).toEqual(['new', 'old']);
  });

  it('pokazuje najnowszy nieprzeczytany odebrany snap przed nowszym wysłanym do tej samej osoby', () => {
    const threads = buildInboxThreads(
      [inbox({ id: 'unread', sender_id: 'friend', created_at: '2026-05-01T10:00:00Z', is_viewed: false })],
      [sent({ id: 'sent-later', receiver_id: 'friend', created_at: '2026-05-01T11:00:00Z' })]
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].direction).toBe('received');
    expect(threads[0].snap.id).toBe('unread');
  });

  it('łączy wysłane i odebrane po rozmówcy oraz zachowuje avatar path w snapie', () => {
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
    expect(threads[0].snap.id).toBe('latest');
  });

  it('zwraca pustą listę dla pustych danych', () => {
    expect(buildInboxThreads([], [])).toEqual([]);
  });

  it('nie zwraca rozmówcy, gdy po usunięciu brak snapów dla peera', () => {
    const beforeDelete = buildInboxThreads(
      [inbox({ id: 'r1', sender_id: 'friend-a', created_at: '2026-05-01T10:00:00Z' })],
      [sent({ id: 's1', receiver_id: 'friend-b', created_at: '2026-05-01T11:00:00Z' })]
    );
    expect(beforeDelete.map((item) => item.direction === 'received' ? item.snap.sender_id : item.snap.receiver_id)).toEqual([
      'friend-b',
      'friend-a',
    ]);

    const afterDelete = buildInboxThreads([], [sent({ id: 's1', receiver_id: 'friend-b', created_at: '2026-05-01T11:00:00Z' })]);
    expect(afterDelete.map((item) => item.direction === 'received' ? item.snap.sender_id : item.snap.receiver_id)).toEqual([
      'friend-b',
    ]);
  });
});
