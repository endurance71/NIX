import { useQuery } from '@tanstack/react-query';
import { ACCEPTED_FRIENDS_LIMIT, listAcceptedFriends } from '../../services/friendService';
import { queryKeys } from '../../lib/queryKeys';
import { resolveSuggestedRecipientId } from '../../lib/suggestedRecipient';
import { useAuth } from '../../hooks/useAuth';
import { useSendMedia } from '../../hooks/useSendMedia';
import type { NixViewDurationSec } from '../../lib/nixViewDuration';

/**
 * Preview opened for a known chat partner (camera from a chat, pasted photo): resolve that person
 * from the cached accepted-friends list and send straight to them. A route param alone is never an
 * authorized recipient, so `recipient` stays null until the friends list confirms it.
 */
export function usePreviewDirectSend({
  isVideo,
  photoUri,
  recipientId,
}: {
  isVideo: boolean;
  photoUri?: string;
  recipientId?: string;
}) {
  const { user, canUseNetworkSession } = useAuth();
  const { data: friends } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: Boolean(user) && Boolean(recipientId) && canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });
  const resolvedId = friends
    ? resolveSuggestedRecipientId({
        recipientId,
        acceptedFriendIds: friends.map((friend) => friend.id),
      })
    : null;
  const recipient = resolvedId ? (friends?.find((friend) => friend.id === resolvedId) ?? null) : null;
  const { send, isSending, canSend } = useSendMedia({ isVideo, photoUri });

  const sendToRecipient = (viewDurationSec: NixViewDurationSec) => {
    if (!recipient) return;
    void send({ recipientIds: [recipient.id], viewDurationSec, returnToPeerId: recipient.id });
  };

  return { recipient, sendToRecipient, isSending, canSend };
}
