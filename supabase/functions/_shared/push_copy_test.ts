import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  formatPushActorLabel,
  pushCopy,
  pushTtlSeconds,
  type PushEventType,
} from './push.ts';

const EVENT_TYPES: PushEventType[] = [
  'new_nix',
  'new_text_message',
  'message_reaction',
  'capture_attempt',
  'friend_request',
  'friend_accepted',
];

Deno.test('push title is the actor and the body describes the action (NOTIF-13)', () => {
  const actor = formatPushActorLabel('Ada', 'ada');
  assertEquals(pushCopy('new_nix', actor, 'pl'), { title: 'Ada', body: 'Wysyła Ci nowy NiX' });
  assertEquals(pushCopy('new_text_message', actor, 'pl'), { title: 'Ada', body: 'Wysyła Ci wiadomość' });
  assertEquals(pushCopy('message_reaction', actor, 'pl', 'heart'), {
    title: 'Ada',
    body: 'Reakcja na Twoją wiadomość: ❤️',
  });
  assertEquals(pushCopy('message_reaction', actor, 'en', 'hahaha'), {
    title: 'Ada',
    body: 'Reacted to your message: 😂',
  });
  assertEquals(pushCopy('friend_accepted', formatPushActorLabel(null, 'ania'), 'pl'), {
    title: '@ania',
    body: 'Jesteście teraz znajomymi',
  });
  assertEquals(pushCopy('new_nix', '   ', 'en').title, '@nix_user');
});

Deno.test('push copy is gender-neutral and never repeats the actor in the body', () => {
  for (const locale of ['pl', 'en'] as const) {
    for (const type of EVENT_TYPES) {
      const { title, body } = pushCopy(type, 'Ada', locale, 'heart');
      assertEquals(title, 'Ada');
      assert(!body.includes('Ada'), `${locale}/${type} body repeats actor`);
      assert(!/\(a\)/.test(body), `${locale}/${type} uses a gendered (a) form: ${body}`);
      assert(body.length > 0);
    }
  }
});

Deno.test('conversation pushes expire one hour after the event, including retries', () => {
  const created = '2026-10-10T12:00:00.000Z';
  const at = (iso: string) => new Date(iso).getTime();
  assertEquals(pushTtlSeconds('new_text_message', created, at('2026-10-10T12:00:00.000Z')), 3600);
  assertEquals(pushTtlSeconds('message_reaction', created, at('2026-10-10T12:15:00.000Z')), 2700);
  assertEquals(pushTtlSeconds('new_nix', created, at('2026-10-10T12:59:59.000Z')), 1);
  // Expired: dispatch skips instead of sending a "now or never" ttl 0.
  assertEquals(pushTtlSeconds('new_nix', created, at('2026-10-10T13:00:00.000Z')), 0);
  assertEquals(pushTtlSeconds('new_text_message', created, at('2026-10-10T15:00:00.000Z')), 0);
  // Clock skew never extends the lifetime.
  assertEquals(pushTtlSeconds('new_text_message', created, at('2026-10-10T11:59:00.000Z')), 3600);
  // Unknown created_at falls back to the full lifetime.
  assertEquals(pushTtlSeconds('new_text_message', null), 3600);
});

Deno.test('friend events and capture alerts keep the provider default ttl', () => {
  assertEquals(pushTtlSeconds('friend_request', '2020-01-01T00:00:00.000Z'), undefined);
  assertEquals(pushTtlSeconds('friend_accepted', '2020-01-01T00:00:00.000Z'), undefined);
  assertEquals(pushTtlSeconds('capture_attempt', '2020-01-01T00:00:00.000Z'), undefined);
});
