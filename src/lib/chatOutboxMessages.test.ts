import { describe, expect, it } from 'vitest';
import { chatOutboxStatus, mergeChatOutboxMessages } from './chatOutboxMessages';
import type { TextOutboxJob } from '../services/textOutboxService';
import type { TextMessage } from '../types/database.types';

function job(partial: Partial<TextOutboxJob> & Pick<TextOutboxJob, 'id'>): TextOutboxJob {
  return {
    ownerId: 'me',
    receiverId: 'peer',
    body: 'hello',
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: 0,
    createdAt: Date.parse('2026-10-10T10:00:00.000Z'),
    updatedAt: 0,
    expiresAt: Date.parse('2026-10-11T10:00:00.000Z'),
    errorCode: null,
    replyToNixId: null,
    replyToMessageId: null,
    ...partial,
  };
}

function server(partial: Partial<TextMessage> & Pick<TextMessage, 'id' | 'created_at'>): TextMessage {
  return {
    sender_id: 'me',
    receiver_id: 'peer',
    body: 'hello',
    expires_at: '2099-01-01T00:00:00.000Z',
    client_message_id: null,
    is_system: false,
    metadata: null,
    ...partial,
  };
}

describe('chatOutboxStatus', () => {
  it('shows waiting for network instead of an endless spinner while offline', () => {
    expect(chatOutboxStatus({ state: 'pending' }, false)).toBe('waiting_network');
    expect(chatOutboxStatus({ state: 'sending' }, false)).toBe('waiting_network');
    expect(chatOutboxStatus({ state: 'pending' }, true)).toBe('sending');
  });

  it('keeps terminal and expired states regardless of connectivity', () => {
    expect(chatOutboxStatus({ state: 'failed' }, false)).toBe('failed');
    expect(chatOutboxStatus({ state: 'expired' }, true)).toBe('expired');
  });
});

describe('mergeChatOutboxMessages', () => {
  it('shows a pending reply with its quote from the loaded chat', () => {
    const quoted = server({ id: 'q1', sender_id: 'peer', receiver_id: 'me', body: 'Idziemy?', created_at: '2026-10-10T09:00:00.000Z' });
    const merged = mergeChatOutboxMessages([quoted], [job({ id: 'r1', replyToMessageId: 'q1' })], 'me');
    expect(merged.at(-1)).toMatchObject({
      id: 'temp-r1',
      reply_to_message_id: 'q1',
      reply_to_message_sender_id: 'peer',
      reply_to_message_kind: 'text',
      reply_to_message_body: 'Idziemy?',
    });
  });

  it('maps outbox jobs to optimistic bubbles with their status', () => {
    const merged = mergeChatOutboxMessages(
      [],
      [job({ id: 'a' }), job({ id: 'b', state: 'expired', body: '' })],
      'me',
      { online: false },
    );
    expect(merged.map((message) => [message.id, message.outboxStatus, message.isSending])).toEqual([
      ['temp-a', 'waiting_network', false],
      ['temp-b', 'expired', false],
    ]);
  });

  it('drops a local copy once the server row with the same client id exists', () => {
    const merged = mergeChatOutboxMessages(
      [server({ id: 's1', created_at: '2026-10-10T10:00:01.000Z', client_message_id: 'a' })],
      [job({ id: 'a', state: 'expired', body: '' })],
      'me',
    );
    expect(merged.map((message) => message.id)).toEqual(['s1']);
  });

  it('hides server messages past expires_at when given a clock (DB-2)', () => {
    const now = Date.parse('2026-10-10T12:00:00.000Z');
    const merged = mergeChatOutboxMessages(
      [
        server({ id: 'old', created_at: '2026-10-09T11:00:00.000Z', expires_at: '2026-10-10T11:00:00.000Z' }),
        server({ id: 'live', created_at: '2026-10-10T11:00:00.000Z', expires_at: '2026-10-11T11:00:00.000Z' }),
      ],
      [],
      'me',
      { now },
    );
    expect(merged.map((message) => message.id)).toEqual(['live']);
  });

  it('does not resurrect an outbox bubble when its delivered server copy expired', () => {
    const merged = mergeChatOutboxMessages(
      [
        server({
          id: 's1',
          created_at: '2026-10-09T10:00:01.000Z',
          expires_at: '2026-10-10T10:00:01.000Z',
          client_message_id: 'a',
        }),
      ],
      [job({ id: 'a' })],
      'me',
      { now: Date.parse('2026-10-10T12:00:00.000Z') },
    );
    expect(merged).toEqual([]);
  });

  it('keeps expired outbox tombstones (their TTL is handled by the outbox)', () => {
    const merged = mergeChatOutboxMessages(
      [],
      [job({ id: 'b', state: 'expired', body: '', expiresAt: Date.parse('2026-10-10T11:00:00.000Z') })],
      'me',
      { now: Date.parse('2026-10-10T12:00:00.000Z') },
    );
    expect(merged.map((message) => message.outboxStatus)).toEqual(['expired']);
  });
});

describe('reply to a NiX', () => {
  it('an outbox bubble carries the NiX it answers, so the quoted header shows at once', () => {
    const merged = mergeChatOutboxMessages([], [job({ id: 'r', replyToNixId: 'nix-1' }), job({ id: 'p' })], 'me');
    expect(merged.map((message) => [message.id, message.reply_to_nix_id])).toEqual([
      ['temp-r', 'nix-1'],
      ['temp-p', null],
    ]);
  });
});
