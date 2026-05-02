import { describe, expect, it } from 'vitest';
import { normalizeAvatarEmoji } from './avatarEmoji';

describe('normalizeAvatarEmoji', () => {
  it('akceptuje pojedyncze emoji', () => {
    expect(normalizeAvatarEmoji('😀')).toBe('😀');
  });

  it('akceptuje emoji ze skórką (jeden grapheme)', () => {
    expect(normalizeAvatarEmoji('👋🏽')).toBe('👋🏽');
  });

  it('odrzuca wiele grapheme', () => {
    expect(() => normalizeAvatarEmoji('😀😀')).toThrow(/jedno emoji/i);
  });

  it('odrzuca pusty string', () => {
    expect(() => normalizeAvatarEmoji('   ')).toThrow(/Podaj jedno emoji/i);
  });
});
