import type { TextMessageForInbox } from './inboxThreads';
import type { TextOutboxJob } from '../services/textOutboxService';
import type { FriendProfile } from '../services/friendService';

export function buildInboxLocalMessages(
  serverTextMessages: TextMessageForInbox[],
  jobs: TextOutboxJob[],
  friends: FriendProfile[],
  currentUserId: string,
) {
  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));
  const serverTextClientIds = new Set(
    serverTextMessages.map((message) => message.client_message_id),
  );
  const localTextMessages: typeof serverTextMessages = [];
  for (const job of jobs) {
    if (serverTextClientIds.has(job.id)) continue;
    const friend = friendsById.get(job.receiverId);
    localTextMessages.push({
      id: `temp-${job.id}`,
      sender_id: currentUserId,
      receiver_id: job.receiverId,
      body: job.body,
      created_at: new Date(job.createdAt).toISOString(),
      expires_at: new Date(job.expiresAt).toISOString(),
      client_message_id: job.id,
      is_system: false,
      metadata: null,
      peer_id: job.receiverId,
      is_unread: false,
      peerProfile: friend
        ? {
            username: friend.username,
            display_name: friend.display_name ?? null,
            avatar_storage_path: friend.avatar_storage_path ?? null,
            avatar_emoji: friend.avatar_emoji ?? null,
          }
        : null,
    });
  }
  return localTextMessages;
}
