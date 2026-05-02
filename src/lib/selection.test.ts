import { describe, expect, it } from 'vitest';
import { toggleSetValue } from './selection';

describe('toggleSetValue', () => {
  it('dodaje brakującą wartość bez mutowania wejścia', () => {
    const current = new Set(['a']);
    const next = toggleSetValue(current, 'b');

    expect([...current]).toEqual(['a']);
    expect([...next].sort()).toEqual(['a', 'b']);
  });

  it('usuwa istniejącą wartość', () => {
    expect([...toggleSetValue(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });
});
