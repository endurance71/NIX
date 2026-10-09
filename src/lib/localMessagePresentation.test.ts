import { describe, expect, it } from 'vitest';
import { mergeChatOutboxMessages } from './chatOutboxMessages';
import { buildInboxLocalMessages } from './inboxLocalMessages';
import type { TextOutboxJob } from '../services/textOutboxService';
import type { FriendProfile } from '../services/friendService';
import type { TextMessage } from '../types/database.types';

function job(
  id: string,
  state: TextOutboxJob['state'] = 'pending',
  createdAt = 1000,
): TextOutboxJob {
  return {
    id,
    ownerId: 'owner',
    receiverId: 'peer',
    body: id,
    state,
    createdAt,
    updatedAt: createdAt,
    expiresAt: 10000,
    attemptCount: 0,
    nextAttemptAt: 0,
    errorCode: null,
  };
}
const server: TextMessage = {
  id: 'server-id',
  sender_id: 'owner',
  receiver_id: 'peer',
  client_message_id: 'acked',
  body: 'acked',
  created_at: new Date(2000).toISOString(),
  expires_at: new Date(10000).toISOString(),
  is_system: false,
  metadata: null,
};
describe('server and local message presentation', () => {
  it('uses acknowledged server messages once and preserves chronological chat order', () => {
    const result = mergeChatOutboxMessages(
      [server],
      [job('acked'), job('later', 'sending', 3000), job('earlier', 'failed', 500)],
      'owner',
    );
    expect(result.map((message) => message.id)).toEqual([
      'temp-earlier',
      'server-id',
      'temp-later',
    ]);
    expect(result[0]).toMatchObject({ sendFailed: true, isSending: false, outboxId: 'earlier' });
    expect(result[2]).toMatchObject({ sendFailed: false, isSending: true });
    expect(result[1]).toBe(server);
  });
  it('hydrates local inbox peers while omitting acknowledged jobs and tolerating absent profiles', () => {
    const friend: FriendProfile = {
      id: 'peer',
      username: 'peer',
      display_name: 'Peer',
      avatar_storage_path: 'avatar',
      avatar_emoji: null,
    };
    const serverInbox = { ...server, peer_id: 'peer', is_unread: false };
    const result = buildInboxLocalMessages(
      [serverInbox],
      [job('acked'), job('pending')],
      [friend],
      'owner',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sender_id: 'owner',
      peer_id: 'peer',
      is_unread: false,
      peerProfile: { username: 'peer', avatar_storage_path: 'avatar' },
    });
    expect(buildInboxLocalMessages([], [job('pending')], [], 'owner')[0].peerProfile).toBeNull();
  });
});
