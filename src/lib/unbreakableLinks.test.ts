import { describe, expect, it } from 'vitest';
import { keepLinksUnbroken } from './unbreakableLinks';

describe('keepLinksUnbroken', () => {
  it('joins the characters of an e-mail so it cannot be hyphenated', () => {
    const out = keepLinksUnbroken('Napisz: nix@shipapp.pl.');
    expect(out.replace(/⁠/g, '')).toBe('Napisz: nix@shipapp.pl.');
    expect(out).toContain('s⁠h⁠i');
    // Sentence punctuation after the address stays breakable.
    expect(out.endsWith('l.')).toBe(true);
    expect(out.startsWith('Napisz: ')).toBe(true);
  });
  it('leaves text without links untouched', () => {
    expect(keepLinksUnbroken('Zwykłe zdanie.')).toBe('Zwykłe zdanie.');
  });
});
