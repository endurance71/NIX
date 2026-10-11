import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  CHAT_MESSAGE_SAVED_EVENT,
  CHAT_TYPING_EVENT,
  PEER_TYPING_TIMEOUT_MS,
  buildTypingPayload,
  chatTypingTopic,
  createTypingSender,
  parsePeerTypingPayload,
  type TypingSender,
} from '../lib/chatTyping';

/**
 * Typing indicator for the open 1:1 chat only: joins the pair's private broadcast topic while the
 * screen is focused and leaves on blur. Nothing is written to the database.
 *
 * If the backend rejects the private join (migration not deployed, not friends, blocked) the hook
 * stays silent: no indicator, no retries until the next focus, no errors shown.
 */
export function useChatTyping({
  peerId,
  currentUserId,
  enabled,
  onMessageSaveChanged,
}: {
  peerId: string;
  currentUserId: string;
  enabled: boolean;
  /** A participant saved / unsaved a message in this chat (server broadcast on the pair topic). */
  onMessageSaveChanged?: () => void;
}) {
  const onSaveChangedRef = useRef(onMessageSaveChanged);
  useEffect(() => {
    onSaveChangedRef.current = onMessageSaveChanged;
  }, [onMessageSaveChanged]);
  const [typingState, setTypingState] = useState<{ peerId: string; typing: boolean }>({
    peerId,
    typing: false,
  });
  const senderRef = useRef<TypingSender | null>(null);
  const peerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPeerTimeout = useCallback(() => {
    if (peerTimeoutRef.current !== null) clearTimeout(peerTimeoutRef.current);
    peerTimeoutRef.current = null;
  }, []);

  const setPeerTyping = useCallback(
    (typing: boolean) => {
      clearPeerTimeout();
      setTypingState((current) =>
        current.peerId === peerId && current.typing === typing ? current : { peerId, typing },
      );
      if (typing) {
        peerTimeoutRef.current = setTimeout(() => {
          peerTimeoutRef.current = null;
          setTypingState((current) => (current.typing ? { peerId, typing: false } : current));
        }, PEER_TYPING_TIMEOUT_MS);
      }
    },
    [clearPeerTimeout, peerId],
  );

  useFocusEffect(
    useCallback(() => {
      const topic = enabled ? chatTypingTopic(currentUserId, peerId) : null;
      if (!topic) return undefined;

      let disposed = false;
      let joined = false;
      let channel: RealtimeChannel | null = null;

      const leave = () => {
        const current = channel;
        channel = null;
        joined = false;
        if (current) void supabase.removeChannel(current).catch(() => undefined);
      };

      senderRef.current = createTypingSender({
        send: (typing) => {
          // Never fall back to the REST broadcast endpoint: only a joined channel sends.
          if (!joined || !channel) return;
          void channel
            .send({
              type: 'broadcast',
              event: CHAT_TYPING_EVENT,
              payload: buildTypingPayload(currentUserId, typing),
            })
            .catch(() => undefined);
        },
      });

      const join = async () => {
        try {
          // `supabase.channel(topic)` would hand back a channel from an earlier visit that is
          // still leaving; remove leftovers first.
          await Promise.all(
            supabase
              .getChannels()
              .filter((existing) => existing.topic === `realtime:${topic}`)
              .map((stale) => supabase.removeChannel(stale).catch(() => undefined)),
          );
          // Private channels are authorized by the JWT sent with the join.
          await supabase.realtime.setAuth().catch(() => undefined);
          if (disposed) return;
          const next = supabase
            .channel(topic, { config: { private: true, broadcast: { self: false, ack: false } } })
            .on('broadcast', { event: CHAT_TYPING_EVENT }, ({ payload }) => {
              const typing = parsePeerTypingPayload(payload, peerId);
              if (typing !== null) setPeerTyping(typing);
            })
            .on('broadcast', { event: CHAT_MESSAGE_SAVED_EVENT }, () => {
              onSaveChangedRef.current?.();
            });
          channel = next;
          next.subscribe((status) => {
            if (channel !== next) return;
            if (status === 'SUBSCRIBED') {
              joined = true;
              return;
            }
            joined = false;
            // Rejected (no policy in production yet, not friends) or lost: stay silent until the
            // next focus instead of retrying in a loop.
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              senderRef.current?.dispose();
              leave();
              setPeerTyping(false);
            }
          });
        } catch {
          leave();
        }
      };
      void join();

      return () => {
        disposed = true;
        // Tell the peer we stopped before leaving (no-op when they were never told otherwise).
        senderRef.current?.stop();
        senderRef.current?.dispose();
        senderRef.current = null;
        leave();
        setPeerTyping(false);
      };
    }, [currentUserId, enabled, peerId, setPeerTyping]),
  );

  useEffect(() => clearPeerTimeout, [clearPeerTimeout]);

  const onComposerInput = useCallback((text: string) => {
    senderRef.current?.input(text);
  }, []);
  const onComposerStop = useCallback(() => {
    senderRef.current?.stop();
  }, []);

  return {
    peerTyping: typingState.peerId === peerId && typingState.typing,
    onComposerInput,
    onComposerStop,
  };
}
