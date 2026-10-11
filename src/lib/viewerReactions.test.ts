import { describe, expect, it } from 'vitest';
import { replyWithNixHref, viewerEmojiMode } from './viewerReactions';

describe('viewerEmojiMode', () => {
  it('hides emoji actions when the viewer cannot reply', () => {
    expect(viewerEmojiMode({ canReply: false, reactionsAvailable: true, nixId: 'n1' })).toBe('none');
  });

  it('reacts when the backend has NiX reactions', () => {
    expect(viewerEmojiMode({ canReply: true, reactionsAvailable: true, nixId: 'n1' })).toBe('reaction');
  });

  it('falls back to a text reply without the migration or before a NiX is on screen', () => {
    expect(viewerEmojiMode({ canReply: true, reactionsAvailable: false, nixId: 'n1' })).toBe('text');
    expect(viewerEmojiMode({ canReply: true, reactionsAvailable: true, nixId: null })).toBe('text');
  });
});

describe('replyWithNixHref', () => {
  it('opens the camera tab with the sender preset', () => {
    expect(replyWithNixHref('sender-1')).toEqual({
      pathname: '/(tabs)',
      params: { recipientId: 'sender-1' },
    });
  });
});
