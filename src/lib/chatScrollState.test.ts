import { describe, expect, it } from 'vitest';
import {
  SCROLL_TO_BOTTOM_HIDE_DISTANCE,
  SCROLL_TO_BOTTOM_SHOW_DISTANCE,
  countAppendedIncomingItems,
  distanceFromListEnd,
  nextScrolledUpState,
} from './chatScrollState';

const text = (id: string, sender: string, isSystem = false) => ({
  type: 'text' as const,
  id,
  message: { sender_id: sender, is_system: isSystem },
});
const nix = (id: string, direction: 'sent' | 'received') => ({ type: 'nix' as const, id, nix: { direction } });
const separator = (id: string) => ({ type: 'separator' as const, id });

describe('distanceFromListEnd', () => {
  it('measures from the bottom-most offset including the bottom inset', () => {
    expect(distanceFromListEnd(1000, 2000, 800, 100)).toBe(300);
    expect(distanceFromListEnd(1300, 2000, 800, 100)).toBe(0);
  });

  it('is zero before the list reported its sizes or when the content fits', () => {
    expect(distanceFromListEnd(0, 0, 800, 0)).toBe(0);
    expect(distanceFromListEnd(0, 500, 800, 0)).toBe(0);
  });
});

describe('nextScrolledUpState', () => {
  it('shows past the show distance and hides only below the hide distance', () => {
    expect(nextScrolledUpState(false, SCROLL_TO_BOTTOM_SHOW_DISTANCE)).toBe(false);
    expect(nextScrolledUpState(false, SCROLL_TO_BOTTOM_SHOW_DISTANCE + 1)).toBe(true);
    expect(nextScrolledUpState(true, SCROLL_TO_BOTTOM_HIDE_DISTANCE + 1)).toBe(true);
    expect(nextScrolledUpState(true, SCROLL_TO_BOTTOM_HIDE_DISTANCE)).toBe(false);
  });
});

describe('countAppendedIncomingItems', () => {
  const before = [separator('s1'), text('t1', 'peer'), text('t2', 'me')];
  const previousIds = new Set(before.map((item) => item.id));

  it('counts the peer texts and received NiXes appended after the newest known item', () => {
    const after = [...before, separator('s2'), text('t3', 'peer'), nix('n1', 'received'), text('t4', 'me')];
    expect(countAppendedIncomingItems(previousIds, after, 'me')).toBe(2);
  });

  it('ignores prepended history, own items, sent NiXes and system lines', () => {
    const after = [
      text('old', 'peer'),
      ...before,
      nix('n2', 'sent'),
      text('sys', 'peer', true),
      { type: 'media' as const, id: 'm1' },
    ];
    expect(countAppendedIncomingItems(previousIds, after, 'me')).toBe(0);
  });

  it('counts nothing without a previous snapshot', () => {
    expect(countAppendedIncomingItems(new Set(), [text('t1', 'peer')], 'me')).toBe(0);
  });
});
