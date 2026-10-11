import { describe, expect, it } from 'vitest';
import { chatNixReplyContext, chatTimelineNixIndex } from './chatNixReply';
import type { ChatTimelineItem } from './chatTimeline';
import type { ChatNixEvent } from '../services/nixService';

const nixes = new Map([
  ['n-photo', { media_type: 'image' }],
  ['n-video', { media_type: 'video' }],
]);

describe('chatNixReplyContext', () => {
  it('is null for a plain text', () => {
    expect(chatNixReplyContext({ sender_id: 'me' }, 'me', nixes)).toBeNull();
    expect(chatNixReplyContext({ sender_id: 'me', reply_to_nix_id: null }, 'me', nixes)).toBeNull();
  });

  it('my reply answers the peer’s NiX; the peer’s reply answers mine', () => {
    expect(chatNixReplyContext({ sender_id: 'me', reply_to_nix_id: 'n-video' }, 'me', nixes)).toEqual({
      nixId: 'n-video',
      kind: 'video',
      nixOwner: 'peer',
      inTimeline: true,
    });
    expect(chatNixReplyContext({ sender_id: 'peer', reply_to_nix_id: 'n-photo' }, 'me', nixes)).toEqual({
      nixId: 'n-photo',
      kind: 'photo',
      nixOwner: 'mine',
      inTimeline: true,
    });
  });

  it('falls back to the media type from the server row when the NiX is not loaded', () => {
    expect(
      chatNixReplyContext(
        { sender_id: 'peer', reply_to_nix_id: 'gone', reply_to_nix_media_type: 'video' },
        'me',
        nixes,
      ),
    ).toEqual({ nixId: 'gone', kind: 'video', nixOwner: 'mine', inTimeline: false });
    expect(chatNixReplyContext({ sender_id: 'peer', reply_to_nix_id: 'gone' }, 'me', nixes)?.kind).toBe('photo');
  });
});

describe('chatTimelineNixIndex', () => {
  const nix = (id: string) => ({ id }) as ChatNixEvent;
  const timeline = [
    { type: 'separator', id: 'sep', label: '', created_at: '' },
    { type: 'nix', id: 'nix-a', created_at: '', nix: nix('a') },
    { type: 'media', id: 'media-j', created_at: '', jobId: 'j', job: null, nix: nix('b') },
  ] as ChatTimelineItem[];

  it('finds received chips and delivered uploads', () => {
    expect(chatTimelineNixIndex(timeline, 'a')).toBe(1);
    expect(chatTimelineNixIndex(timeline, 'b')).toBe(2);
    expect(chatTimelineNixIndex(timeline, 'missing')).toBe(-1);
  });
});
