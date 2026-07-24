import { describe, expect, it } from 'vitest';
import {
  buildChatTimeline,
  buildUnifiedChatTimeline,
  formatChatSeparatorLabel,
  sortMessagesAscending,
} from './chatTimeline';
import type { TextMessage } from '../types/database.types';
import type { ChatNixEvent } from '../services/nixService';

function msg(partial: Partial<TextMessage> & Pick<TextMessage, 'id' | 'created_at'>): TextMessage {
  return {
    sender_id: 'a',
    receiver_id: 'b',
    body: 'hi',
    expires_at: '2099-01-01T00:00:00.000Z',
    client_message_id: null,
    ...partial,
  };
}

function nix(partial: Partial<ChatNixEvent> & Pick<ChatNixEvent, 'id' | 'created_at'>): ChatNixEvent {
  return {
    direction: 'sent',
    media_type: 'image',
    media_path: 'path.jpg',
    thumbnail_b64: null,
    is_viewed: false,
    status: 'sent',
    view_duration_sec: 5,
    ...partial,
  };
}

describe('sortMessagesAscending', () => {
  it('sorts by created_at ascending', () => {
    const sorted = sortMessagesAscending([
      msg({ id: '2', created_at: '2026-07-24T12:00:00.000Z' }),
      msg({ id: '1', created_at: '2026-07-24T10:00:00.000Z' }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['1', '2']);
  });
});

describe('formatChatSeparatorLabel', () => {
  it('formats same-day as time only', () => {
    const now = new Date('2026-07-24T15:00:00');
    const label = formatChatSeparatorLabel('2026-07-24T12:39:00', 'pl', now);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toMatch(/2026/);
  });

  it('returns stable labels across repeated calls for the same locale', () => {
    const now = new Date('2026-07-24T15:00:00');
    const first = formatChatSeparatorLabel('2026-07-20T12:39:00', 'pl', now);
    const second = formatChatSeparatorLabel('2026-07-20T12:39:00', 'pl', now);
    expect(first).toBe(second);
    expect(first).toMatch(/2026|lip|Jul|VII/i);
  });
});

describe('buildChatTimeline', () => {
  it('inserts separators on day change and large gaps', () => {
    const now = new Date('2026-07-24T18:00:00');
    const timeline = buildChatTimeline(
      [
        msg({ id: '1', created_at: '2026-07-24T10:00:00.000Z', body: 'a' }),
        msg({ id: '2', created_at: '2026-07-24T10:05:00.000Z', body: 'b' }),
        msg({ id: '3', created_at: '2026-07-24T12:30:00.000Z', body: 'c' }),
      ],
      'pl',
      now
    );

    expect(timeline.filter((item) => item.type === 'separator')).toHaveLength(2);
    expect(timeline.filter((item) => item.type === 'text')).toHaveLength(3);
    expect(timeline[0]?.type).toBe('separator');
    expect(timeline[1]?.type).toBe('text');
  });
});

describe('buildUnifiedChatTimeline', () => {
  it('interleaves text and nix chronologically', () => {
    const timeline = buildUnifiedChatTimeline(
      [msg({ id: 't1', created_at: '2026-07-24T10:05:00.000Z', body: 'hi' })],
      [nix({ id: 'n1', created_at: '2026-07-24T10:00:00.000Z' })],
      'pl',
      new Date('2026-07-24T18:00:00')
    );

    const content = timeline.filter((item) => item.type !== 'separator');
    expect(content.map((item) => item.type)).toEqual(['nix', 'text']);
  });
});
