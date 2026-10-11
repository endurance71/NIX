import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTypingPayload,
  chatTypingTopic,
  createTypingSender,
  parsePeerTypingPayload,
} from './chatTyping';

const A = 'F3000000-0000-4000-8000-000000000001';
const B = 'f3000000-0000-4000-8000-000000000002';

describe('chatTypingTopic', () => {
  it('is the same canonical lowercase topic for both participants', () => {
    const expected = 'typing:f3000000-0000-4000-8000-000000000001:f3000000-0000-4000-8000-000000000002';
    expect(chatTypingTopic(A, B)).toBe(expected);
    expect(chatTypingTopic(B, A)).toBe(expected);
  });

  it('has no topic for a missing or identical user', () => {
    expect(chatTypingTopic('', B)).toBeNull();
    expect(chatTypingTopic(B, B.toUpperCase())).toBeNull();
  });
});

describe('parsePeerTypingPayload', () => {
  it('accepts only well-formed broadcasts from the peer', () => {
    expect(parsePeerTypingPayload(buildTypingPayload(B, true), B)).toBe(true);
    expect(parsePeerTypingPayload(buildTypingPayload(B, false), B.toUpperCase())).toBe(false);
    expect(parsePeerTypingPayload(buildTypingPayload(A, true), B)).toBeNull();
    expect(parsePeerTypingPayload({ v: 2, user_id: B, typing: true }, B)).toBeNull();
    expect(parsePeerTypingPayload({ user_id: B, typing: 'yes' }, B)).toBeNull();
    expect(parsePeerTypingPayload(null, B)).toBeNull();
  });
});

describe('createTypingSender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const sent: boolean[] = [];
    const sender = createTypingSender({ send: (typing) => sent.push(typing), throttleMs: 2_000, idleMs: 4_000 });
    return { sent, sender };
  }

  it('sends typing at most once per throttle window while the user keeps typing', () => {
    const { sent, sender } = setup();
    sender.input('a');
    vi.advanceTimersByTime(500);
    sender.input('ab');
    vi.advanceTimersByTime(1_000);
    sender.input('abc');
    expect(sent).toEqual([true]);
    vi.advanceTimersByTime(600);
    sender.input('abcd');
    expect(sent).toEqual([true, true]);
  });

  it('sends stopped after the idle timeout', () => {
    const { sent, sender } = setup();
    sender.input('a');
    vi.advanceTimersByTime(3_999);
    expect(sent).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([true, false]);
  });

  it('sends stopped on send/blur and on an emptied input, only after typing was announced', () => {
    const { sent, sender } = setup();
    sender.stop();
    expect(sent).toEqual([]);
    sender.input('hello');
    sender.stop();
    expect(sent).toEqual([true, false]);
    sender.stop();
    expect(sent).toEqual([true, false]);
  });

  it('delays a restart inside the throttle window instead of flooding', () => {
    const { sent, sender } = setup();
    sender.input('a');
    sender.input('');
    sender.input('b');
    expect(sent).toEqual([true, false]);
    vi.advanceTimersByTime(2_000);
    expect(sent).toEqual([true, false, true]);
  });

  it('drops a pending restart when the user stops before the window ends', () => {
    const { sent, sender } = setup();
    sender.input('a');
    sender.input('');
    sender.input('b');
    sender.input('');
    vi.advanceTimersByTime(5_000);
    expect(sent).toEqual([true, false]);
  });

  it('dispose cancels timers without sending', () => {
    const { sent, sender } = setup();
    sender.input('a');
    sender.dispose();
    vi.advanceTimersByTime(10_000);
    expect(sent).toEqual([true]);
  });
});
