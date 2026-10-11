import { describe, expect, it } from 'vitest';
import { chatMessageActions, chatMessageReplyContext, NO_CHAT_MESSAGE_ACTIONS } from './chatMessageActions';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const ALL = { messageReplies: true, messageEdits: true };

function message(partial: Partial<Parameters<typeof chatMessageActions>[0]> = {}) {
  return {
    id: 'm1',
    sender_id: 'me',
    created_at: new Date(NOW - 60_000).toISOString(),
    body: 'Cześć',
    kind: 'text',
    edit_count: 0,
    ...partial,
  };
}

const params = { currentUserId: 'me', now: NOW, online: true, capabilities: ALL };

describe('chatMessageActions', () => {
  it('offers everything on a fresh own text', () => {
    expect(chatMessageActions(message(), params)).toEqual({ reply: true, edit: true, unsend: true, forward: true });
  });

  it('closes unsend after 5 minutes and edit after 15', () => {
    const eight = message({ created_at: new Date(NOW - 8 * 60_000).toISOString() });
    expect(chatMessageActions(eight, params)).toMatchObject({ edit: true, unsend: false });
    const twenty = message({ created_at: new Date(NOW - 20 * 60_000).toISOString() });
    expect(chatMessageActions(twenty, params)).toMatchObject({ edit: false, unsend: false, reply: true });
  });

  it('stops editing after five edits', () => {
    expect(chatMessageActions(message({ edit_count: 5 }), params).edit).toBe(false);
  });

  it('never edits or unsends the peer’s message', () => {
    expect(chatMessageActions(message({ sender_id: 'peer' }), params)).toEqual({
      reply: true,
      edit: false,
      unsend: false,
      forward: true,
    });
  });

  it('unsends but never edits or forwards a voice message', () => {
    expect(chatMessageActions(message({ kind: 'voice', body: '🎤 0:12' }), params)).toEqual({
      reply: true,
      edit: false,
      unsend: true,
      forward: false,
    });
  });

  it('keeps local outbox copies to forwarding only', () => {
    expect(chatMessageActions(message({ id: 'temp-1', outboxStatus: 'sending' }), params)).toEqual({
      reply: false,
      edit: false,
      unsend: false,
      forward: true,
    });
    expect(chatMessageActions(message({ outboxStatus: 'expired', body: '' }), params).forward).toBe(false);
  });

  it('needs the network for edit / unsend and the backend for both features', () => {
    expect(chatMessageActions(message(), { ...params, online: false })).toMatchObject({
      reply: true,
      edit: false,
      unsend: false,
    });
    expect(
      chatMessageActions(message(), { ...params, capabilities: { messageReplies: false, messageEdits: false } }),
    ).toEqual({ reply: false, edit: false, unsend: false, forward: true });
  });

  it('offers nothing on a system message', () => {
    expect(chatMessageActions(message({ is_system: true }), params)).toEqual(NO_CHAT_MESSAGE_ACTIONS);
  });
});

describe('chatMessageReplyContext', () => {
  it('reads the quoted preview and its author', () => {
    expect(
      chatMessageReplyContext(
        {
          reply_to_message_id: 'q1',
          reply_to_message_sender_id: 'peer',
          reply_to_message_kind: 'text',
          reply_to_message_body: 'Idziemy\n  jutro?',
        },
        'me',
      ),
    ).toEqual({ messageId: 'q1', author: 'peer', kind: 'text', snippet: 'Idziemy jutro?' });
  });

  it('shows a voice message without a snippet', () => {
    expect(
      chatMessageReplyContext(
        { reply_to_message_id: 'q1', reply_to_message_sender_id: 'me', reply_to_message_kind: 'voice' },
        'me',
      ),
    ).toEqual({ messageId: 'q1', author: 'me', kind: 'voice', snippet: '' });
  });

  it('hides the quote once the server dropped its preview', () => {
    expect(chatMessageReplyContext({ reply_to_message_id: 'q1' }, 'me')).toBeNull();
    expect(chatMessageReplyContext({}, 'me')).toBeNull();
  });
});
