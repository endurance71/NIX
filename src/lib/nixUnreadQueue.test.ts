import { describe, expect, it } from 'vitest';
import { filterUnreadInboxNixesFromSender } from './nixUnreadQueue';
import type { InboxNix } from '../services/nixService';

function nix(partial: Partial<InboxNix> & Pick<InboxNix, 'id' | 'created_at'>): InboxNix {
  return {
    sender_id: 'sender-a',
    media_path: `nixes/sender-a/${partial.id}.jpg`,
    is_viewed: false,
    media_type: 'image',
    playback_duration_ms: null,
    view_duration_sec: 5,
    is_replayed: false,
    replay_expires_at: null,
    status: 'sent',
    sender: null,
    ...partial,
  };
}

describe('filterUnreadInboxNixesFromSender', () => {
  it('sortuje oldest → newest i pomija cleaned / pusty path', () => {
    const queue = filterUnreadInboxNixesFromSender(
      [
        nix({ id: 'new', created_at: '2026-08-10T12:00:00.000Z' }),
        nix({ id: 'old', created_at: '2026-08-08T12:00:00.000Z' }),
        nix({
          id: 'cleaned',
          created_at: '2026-08-09T12:00:00.000Z',
          status: 'cleaned',
        }),
        nix({
          id: 'empty-path',
          created_at: '2026-08-09T13:00:00.000Z',
          media_path: '',
        }),
        nix({
          id: 'other-sender',
          created_at: '2026-08-07T12:00:00.000Z',
          sender_id: 'sender-b',
        }),
        nix({
          id: 'already-viewed',
          created_at: '2026-08-07T11:00:00.000Z',
          is_viewed: true,
        }),
      ],
      'sender-a'
    );

    expect(queue.map((item) => item.id)).toEqual(['old', 'new']);
  });
});
