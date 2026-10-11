import { describe, expect, it } from 'vitest';
import {
  buildChatTimeline,
  buildUnifiedChatTimeline,
  chatPeerProfileFromInboxBundle,
  chatTextItemId,
  formatChatSeparatorLabel,
  formatChatTime,
  isTextMessageExpired,
  sortMessagesAscending,
} from './chatTimeline';
import type { InboxBundle } from './inboxQuery';
import type { TextMessage } from '../types/database.types';
import type { ChatNixEvent } from '../services/nixService';

function msg(partial: Partial<TextMessage> & Pick<TextMessage, 'id' | 'created_at'>): TextMessage {
  return {
    sender_id: 'a',
    receiver_id: 'b',
    body: 'hi',
    expires_at: '2099-01-01T00:00:00.000Z',
    client_message_id: null, is_system: false, metadata: null,
    ...partial,
  };
}

function nix(partial: Partial<ChatNixEvent> & Pick<ChatNixEvent, 'id' | 'created_at'>): ChatNixEvent {
  return {
    direction: 'sent',
    media_type: 'image',
    media_path: 'path.jpg',
    thumbnail_b64: null,
    is_viewed: false, is_replayed: false, replay_expires_at: null,
    status: 'sent',
    view_duration_sec: 5,
    client_upload_id: null,
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
    const first = formatChatSeparatorLabel('2026-07-10T12:39:00', 'pl', now);
    const second = formatChatSeparatorLabel('2026-07-10T12:39:00', 'pl', now);
    expect(first).toBe(second);
    expect(first).toMatch(/2026|lip|Jul|VII/i);
  });

  const relative = {
    today: (time: string) => `Dziś ${time}`,
    yesterday: (time: string) => `Wczoraj ${time}`,
  };

  it('uses the relative labels for today and yesterday', () => {
    const now = new Date('2026-07-24T00:30:00');
    const today = formatChatSeparatorLabel('2026-07-24T00:10:00', 'pl', now, relative);
    const yesterday = formatChatSeparatorLabel('2026-07-23T23:50:00', 'pl', now, relative);
    expect(today).toMatch(/^Dziś 0?0:10$/);
    expect(yesterday).toMatch(/^Wczoraj 23:50$/);
  });

  it('names the weekday within the last week and the date after that', () => {
    const now = new Date('2026-07-24T15:00:00'); // Friday
    const monday = formatChatSeparatorLabel('2026-07-20T12:39:00', 'pl', now, relative);
    expect(monday).toMatch(/^Poniedziałek/);
    expect(monday).toMatch(/12:39/);
    const older = formatChatSeparatorLabel('2026-07-16T12:39:00', 'pl', now, relative);
    expect(older).not.toMatch(/^Dziś|^Wczoraj/);
    expect(older).toMatch(/lip/i);
  });

  it('keeps the time-only label for today without relative labels (older callers)', () => {
    const now = new Date('2026-07-24T15:00:00');
    expect(formatChatSeparatorLabel('2026-07-24T12:39:00', 'pl', now)).toBe(
      formatChatTime('2026-07-24T12:39:00', 'pl')
    );
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

  it('places a local upload bubble on the same chronological timeline', () => {
    const upload = {
      id: 'upload-1',
      batchId: null,
      createdAt: new Date('2026-07-24T10:03:00.000Z').getTime(),
    } as NonNullable<Parameters<typeof buildUnifiedChatTimeline>[4]>[number];
    const timeline = buildUnifiedChatTimeline(
      [msg({ id: 't1', created_at: '2026-07-24T10:05:00.000Z', body: 'hi' })],
      [nix({ id: 'n1', created_at: '2026-07-24T10:00:00.000Z' })],
      'pl',
      new Date('2026-07-24T18:00:00'),
      [upload]
    );

    const content = timeline.filter((item) => item.type !== 'separator');
    expect(content.map((item) => item.type)).toEqual(['nix', 'media', 'text']);
  });

  it('keeps an outbox text bubble key when the server copy replaces it', () => {
    const now = new Date('2026-07-24T18:00:00');
    const local = buildUnifiedChatTimeline(
      [msg({ id: 'temp-c1', client_message_id: 'c1', created_at: '2026-07-24T10:00:00.000Z' })],
      [],
      'pl',
      now
    );
    const delivered = buildUnifiedChatTimeline(
      [msg({ id: 'server-1', client_message_id: 'c1', created_at: '2026-07-24T10:00:01.000Z' })],
      [],
      'pl',
      now
    );
    expect(local.map((item) => item.id)).toEqual(delivered.map((item) => item.id));
    expect(chatTextItemId({ id: 'x', client_message_id: null })).toBe('text-x');
  });
});

describe('SEND-8: one stable media cell from upload to delivered NiX', () => {
  const now = new Date('2026-07-24T18:00:00');
  const jobCreatedAt = new Date('2026-07-24T10:00:00.000Z').getTime();
  const upload = {
    id: 'job-1',
    batchId: 'batch-1',
    createdAt: jobCreatedAt,
  } as NonNullable<Parameters<typeof buildUnifiedChatTimeline>[4]>[number];
  const anchors = [{ jobId: 'job-1', batchId: 'batch-1', createdAt: jobCreatedAt }];
  // Text typed while the video was compressing: it was sent after the job was created.
  const textDuringCompression = msg({
    id: 't1',
    client_message_id: 'c1',
    created_at: '2026-07-24T10:00:30.000Z',
  });
  // The server stamps the NiX after compression, i.e. later than the text.
  const deliveredNix = nix({
    id: 'n1',
    created_at: '2026-07-24T10:01:00.000Z',
    client_upload_id: 'batch-1',
  });

  const uploading = buildUnifiedChatTimeline([textDuringCompression], [], 'pl', now, [upload], anchors);
  const delivered = buildUnifiedChatTimeline([textDuringCompression], [deliveredNix], 'pl', now, [], anchors);

  it('keeps the key, the item type and the position', () => {
    expect(uploading.map((item) => [item.id, item.type])).toEqual(
      delivered.map((item) => [item.id, item.type])
    );
    expect(delivered.filter((item) => item.type !== 'separator').map((item) => item.id)).toEqual([
      'media-job-1',
      'text-c1',
    ]);
  });

  it('swaps the content of the media cell from the job to the server NiX', () => {
    const before = uploading.find((item) => item.type === 'media');
    const after = delivered.find((item) => item.type === 'media');
    expect(before).toMatchObject({ job: upload, nix: null, created_at: '2026-07-24T10:00:00.000Z' });
    expect(after).toMatchObject({ job: null, nix: deliveredNix, created_at: '2026-07-24T10:00:00.000Z' });
  });

  it('keeps separator ids stable across the transition', () => {
    const separators = (items: typeof uploading) =>
      items.filter((item) => item.type === 'separator').map((item) => item.id);
    expect(separators(uploading)).toEqual(separators(delivered));
  });

  it('does not render the matched NiX twice while the job is still visible', () => {
    const both = buildUnifiedChatTimeline([], [deliveredNix], 'pl', now, [upload], anchors);
    const content = both.filter((item) => item.type !== 'separator');
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ id: 'media-job-1', job: upload, nix: deliveredNix });
  });

  it('renders NiXes without a local anchor as plain NiX items', () => {
    const received = nix({ id: 'n2', direction: 'received', created_at: '2026-07-24T10:02:00.000Z' });
    const timeline = buildUnifiedChatTimeline([], [deliveredNix, received], 'pl', now);
    expect(timeline.filter((item) => item.type !== 'separator').map((item) => item.id)).toEqual([
      'nix-n1',
      'nix-n2',
    ]);
  });
});

describe('local text expiry (DB-2)', () => {
  const now = Date.parse('2026-10-10T12:00:00.000Z');

  it('treats a message as expired from its expires_at on', () => {
    expect(isTextMessageExpired({ expires_at: '2026-10-10T11:59:59.999Z' }, now)).toBe(true);
    expect(isTextMessageExpired({ expires_at: '2026-10-10T12:00:00.000Z' }, now)).toBe(true);
    expect(isTextMessageExpired({ expires_at: '2026-10-10T12:00:00.001Z' }, now)).toBe(false);
    expect(isTextMessageExpired({ expires_at: 'not a date' }, now)).toBe(false);
  });
});

describe('chatPeerProfileFromInboxBundle (DB-7)', () => {
  const profile = {
    username: 'peer_user',
    display_name: 'Peer',
    avatar_storage_path: 'peer/avatar.jpg',
    avatar_emoji: null,
  };

  function bundle(partial: Partial<InboxBundle>): InboxBundle {
    return { inboxData: [], sentData: [], textMessagesData: [], unreadCount: 0, ...partial };
  }

  it('returns undefined without a cached bundle or a known peer', () => {
    expect(chatPeerProfileFromInboxBundle(undefined, 'peer')).toBeUndefined();
    expect(chatPeerProfileFromInboxBundle(bundle({}), 'peer')).toBeUndefined();
  });

  it('takes the profile from a text preview of that peer', () => {
    const cached = bundle({
      textMessagesData: [
        { ...msg({ id: 'm1', created_at: '2026-10-10T10:00:00.000Z' }), peer_id: 'other', peerProfile: null },
        { ...msg({ id: 'm2', created_at: '2026-10-10T10:00:00.000Z' }), peer_id: 'peer', peerProfile: profile },
      ],
    });
    expect(chatPeerProfileFromInboxBundle(cached, 'peer')).toEqual({ id: 'peer', ...profile });
  });

  it('falls back to received and sent NiX profiles', () => {
    const received = bundle({
      inboxData: [{ sender_id: 'peer', sender: profile } as unknown as InboxBundle['inboxData'][number]],
    });
    const sent = bundle({
      sentData: [{ receiver_id: 'peer', receiver: profile } as unknown as InboxBundle['sentData'][number]],
    });
    expect(chatPeerProfileFromInboxBundle(received, 'peer')?.username).toBe('peer_user');
    expect(chatPeerProfileFromInboxBundle(sent, 'peer')?.avatar_storage_path).toBe('peer/avatar.jpg');
  });
});

describe('bubble groups', () => {
  const groups = (items: ReturnType<typeof buildUnifiedChatTimeline>) =>
    items.flatMap((item) => (item.type === 'text' ? [[item.message.id, item.group]] : []));

  it('groups consecutive messages of one sender within two minutes', () => {
    const timeline = buildUnifiedChatTimeline(
      [
        msg({ id: '1', created_at: '2026-07-24T10:00:00.000Z' }),
        msg({ id: '2', created_at: '2026-07-24T10:01:00.000Z' }),
        msg({ id: '3', created_at: '2026-07-24T10:02:30.000Z' }),
        msg({ id: '4', created_at: '2026-07-24T10:02:40.000Z', sender_id: 'b', receiver_id: 'a' }),
        msg({ id: '5', created_at: '2026-07-24T10:10:00.000Z', sender_id: 'b', receiver_id: 'a' }),
      ],
      [],
      'pl',
      new Date('2026-07-24T12:00:00.000Z'),
    );
    expect(groups(timeline)).toEqual([
      ['1', 'first'],
      ['2', 'middle'],
      ['3', 'last'],
      ['4', 'single'],
      ['5', 'single'],
    ]);
  });

  it('a NiX, a separator or a system line ends the group', () => {
    const timeline = buildUnifiedChatTimeline(
      [
        msg({ id: '1', created_at: '2026-07-24T10:00:00.000Z' }),
        msg({ id: '2', created_at: '2026-07-24T10:00:20.000Z' }),
        msg({ id: 'sys', created_at: '2026-07-24T10:00:40.000Z', is_system: true }),
        msg({ id: '3', created_at: '2026-07-24T10:01:00.000Z' }),
        msg({ id: '4', created_at: '2026-07-24T10:01:30.000Z' }),
      ],
      [nix({ id: 'n1', created_at: '2026-07-24T10:00:10.000Z' })],
      'pl',
      new Date('2026-07-24T12:00:00.000Z'),
    );
    expect(groups(timeline)).toEqual([
      ['1', 'single'],
      ['2', 'single'],
      ['sys', undefined],
      ['3', 'first'],
      ['4', 'last'],
    ]);
  });

  it('a reply to a NiX starts a new group (its header sits above the bubble)', () => {
    const timeline = buildUnifiedChatTimeline(
      [
        msg({ id: '1', created_at: '2026-07-24T10:00:00.000Z' }),
        msg({ id: 'reply', created_at: '2026-07-24T10:00:10.000Z', reply_to_nix_id: 'n1' }),
        msg({ id: '2', created_at: '2026-07-24T10:00:20.000Z' }),
        msg({ id: 'reply2', created_at: '2026-07-24T10:00:30.000Z', reply_to_nix_id: 'n2' }),
      ],
      [],
      'pl',
      new Date('2026-07-24T12:00:00.000Z'),
    );
    expect(groups(timeline)).toEqual([
      ['1', 'single'],
      ['reply', 'first'],
      ['2', 'last'],
      ['reply2', 'single'],
    ]);
  });

  it('the text-only builder groups too', () => {
    const timeline = buildChatTimeline(
      [
        msg({ id: '1', created_at: '2026-07-24T10:00:00.000Z' }),
        msg({ id: '2', created_at: '2026-07-24T10:00:05.000Z' }),
      ],
      'pl',
      new Date('2026-07-24T12:00:00.000Z'),
    );
    expect(timeline.flatMap((item) => (item.type === 'text' ? [item.group] : []))).toEqual(['first', 'last']);
  });
});
