import { describe, expect, it } from 'vitest';
import { BUBBLE_INNER_RADIUS, BUBBLE_RADIUS, chatBubbleShape } from './chatBubbleShape';

describe('chatBubbleShape', () => {
  it('a lone bubble is fully rounded and has the tail', () => {
    expect(chatBubbleShape('single', true)).toMatchObject({
      borderTopRightRadius: BUBBLE_RADIUS,
      borderBottomRightRadius: BUBBLE_RADIUS,
      showTail: true,
    });
    expect(chatBubbleShape(undefined, false).showTail).toBe(true);
  });

  it('only the sender side gets the tighter inner corners', () => {
    const own = chatBubbleShape('middle', true);
    expect(own.borderTopRightRadius).toBe(BUBBLE_INNER_RADIUS);
    expect(own.borderBottomRightRadius).toBe(BUBBLE_INNER_RADIUS);
    expect(own.borderTopLeftRadius).toBe(BUBBLE_RADIUS);
    const incoming = chatBubbleShape('first', false);
    expect(incoming.borderTopLeftRadius).toBe(BUBBLE_RADIUS);
    expect(incoming.borderBottomLeftRadius).toBe(BUBBLE_INNER_RADIUS);
    expect(incoming.borderBottomRightRadius).toBe(BUBBLE_RADIUS);
  });

  it('only the last bubble of a group has a tail and the full bottom corner', () => {
    expect(chatBubbleShape('first', true).showTail).toBe(false);
    expect(chatBubbleShape('middle', true).showTail).toBe(false);
    const last = chatBubbleShape('last', true);
    expect(last.showTail).toBe(true);
    expect(last.borderTopRightRadius).toBe(BUBBLE_INNER_RADIUS);
    expect(last.borderBottomRightRadius).toBe(BUBBLE_RADIUS);
  });

  it('spacing shrinks inside a group', () => {
    const first = chatBubbleShape('first', true);
    const last = chatBubbleShape('last', true);
    expect(first.paddingBottom).toBeLessThan(first.paddingTop);
    expect(last.paddingTop).toBeLessThan(last.paddingBottom);
  });
});
