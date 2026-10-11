import { describe, expect, it } from 'vitest';
import {
  mergePendingVoiceMessages,
  voiceClientIdFromOutboxId,
  voiceOutboxId,
  type PendingVoiceMessage,
} from './chatVoiceOutbox';

const pending = (partial: Partial<PendingVoiceMessage>): PendingVoiceMessage => ({
  clientId: 'c1',
  receiverId: 'peer',
  localUri: 'file:///take.m4a',
  durationMs: 3_000,
  waveform: [10, 20],
  createdAt: Date.parse('2026-10-12T10:05:00Z'),
  status: 'sending',
  uploadedPath: null,
  ...partial,
});

describe('chatVoiceOutbox', () => {
  it('round-trips outbox ids and leaves text outbox ids alone', () => {
    expect(voiceClientIdFromOutboxId(voiceOutboxId('abc'))).toBe('abc');
    expect(voiceClientIdFromOutboxId('abc')).toBeNull();
  });

  it('adds unsent takes of this conversation in time order', () => {
    const server = [
      { id: 's1', created_at: '2026-10-12T10:00:00Z', client_message_id: null },
      { id: 's2', created_at: '2026-10-12T10:10:00Z', client_message_id: null },
    ];
    const merged = mergePendingVoiceMessages(server, [pending({}), pending({ clientId: 'other', receiverId: 'x' })], 'me', 'peer');
    expect(merged.map((message) => message.created_at)).toEqual([
      '2026-10-12T10:00:00Z',
      '2026-10-12T10:05:00.000Z',
      '2026-10-12T10:10:00Z',
    ]);
    expect(merged[1]).toMatchObject({ kind: 'voice', outboxStatus: 'sending', outboxId: 'voice:c1', sender_id: 'me' });
  });

  it('a delivered take (same client id on the server) is not shown twice', () => {
    const server = [{ id: 's1', created_at: '2026-10-12T10:05:01Z', client_message_id: 'c1' }];
    expect(mergePendingVoiceMessages(server, [pending({})], 'me', 'peer')).toBe(server);
  });
});
