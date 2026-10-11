import { describe, expect, it } from 'vitest';
import {
  getProfileFieldDecision,
  isProfileBioTooLong,
  normalizeDisplayName,
  normalizeProfileBio,
  validateDisplayName,
} from './profileEdit';

describe('profile edit fields', () => {
  it('compares normalized fields and preserves empty bio and required name semantics', () => {
    expect(getProfileFieldDecision('bio', '  ', '').unchanged).toBe(true);
    expect(getProfileFieldDecision('display_name', ' Name ', 'Name').unchanged).toBe(true);
    expect(getProfileFieldDecision('display_name', ' ', '').errorKey).toBe('profile.displayNameRequired');
    expect(getProfileFieldDecision('bio', 'x'.repeat(141), '').invalid).toBe(true);
    expect(getProfileFieldDecision('display_name', 'New', 'Old')).toMatchObject({ invalid: false, unchanged: false, maxLength: 50 });
  });
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
