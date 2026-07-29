import { assertEquals } from 'jsr:@std/assert@1';
import {
  cappedPushBadge,
  isConversationMuteActive,
  isPushCategoryEnabled,
} from './push.ts';

Deno.test('push preferences filter categories but never suppress capture alerts', () => {
  const disabled = {
    messages_enabled: false,
    reactions_enabled: false,
    friends_enabled: false,
  };
  assertEquals(isPushCategoryEnabled('new_nix', disabled), false);
  assertEquals(isPushCategoryEnabled('new_text_message', disabled), false);
  assertEquals(isPushCategoryEnabled('message_reaction', disabled), false);
  assertEquals(isPushCategoryEnabled('friend_request', disabled), false);
  assertEquals(isPushCategoryEnabled('capture_attempt', disabled), true);
});

Deno.test('conversation mute supports expiry and indefinite mode', () => {
  const now = Date.parse('2026-07-29T10:00:00.000Z');
  assertEquals(isConversationMuteActive(null, now), false);
  assertEquals(isConversationMuteActive({ muted_until: null }, now), true);
  assertEquals(
    isConversationMuteActive({ muted_until: '2026-07-29T11:00:00.000Z' }, now),
    true
  );
  assertEquals(
    isConversationMuteActive({ muted_until: '2026-07-29T09:00:00.000Z' }, now),
    false
  );
});

Deno.test('push badge is bounded for iOS', () => {
  assertEquals(cappedPushBadge(-3), 0);
  assertEquals(cappedPushBadge(42), 42);
  assertEquals(cappedPushBadge(120), 99);
});
