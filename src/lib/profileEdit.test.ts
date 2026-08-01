import { describe, expect, it } from 'vitest';
import {
  isProfileBioTooLong,
  normalizeDisplayName,
  normalizeProfileBio,
  validateDisplayName,
} from './profileEdit';

describe('profile edit fields', () => {
  it('normalizes and validates a display name', () => {
    expect(normalizeDisplayName('  Damian  ')).toBe('Damian');
    expect(validateDisplayName('   ')).toBe('required');
    expect(validateDisplayName('x'.repeat(51))).toBe('too_long');
    expect(validateDisplayName('Damian')).toBeNull();
  });

  it('stores an empty bio as null and enforces the limit', () => {
    expect(normalizeProfileBio('   ')).toBeNull();
    expect(normalizeProfileBio('  Hej!  ')).toBe('Hej!');
    expect(isProfileBioTooLong('x'.repeat(140))).toBe(false);
    expect(isProfileBioTooLong('x'.repeat(141))).toBe(true);
  });
});
