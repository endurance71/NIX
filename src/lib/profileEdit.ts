export const DISPLAY_NAME_MAX_LENGTH = 50;
export const PROFILE_BIO_MAX_LENGTH = 140;

export type DisplayNameValidationError = 'required' | 'too_long' | null;

export function normalizeDisplayName(value: string): string {
  return value.trim();
}

export function validateDisplayName(value: string): DisplayNameValidationError {
  const normalized = normalizeDisplayName(value);
  if (!normalized) return 'required';
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) return 'too_long';
  return null;
}

export function normalizeProfileBio(value: string): string | null {
  return value.trim() || null;
}

export function isProfileBioTooLong(value: string): boolean {
  return value.trim().length > PROFILE_BIO_MAX_LENGTH;
}

export function getProfileFieldDecision(
  field: 'display_name' | 'bio',
  value: string,
  initialValue: string,
) {
  const isDisplayName = field === 'display_name';
  const normalize = isDisplayName ? normalizeDisplayName : normalizeProfileBio;
  const maxLength = isDisplayName ? DISPLAY_NAME_MAX_LENGTH : PROFILE_BIO_MAX_LENGTH;
  const displayNameError = isDisplayName ? validateDisplayName(value) : null;
  const bioTooLong = !isDisplayName && isProfileBioTooLong(value);
  const errorKey =
    displayNameError === 'required'
      ? 'profile.displayNameRequired'
      : displayNameError === 'too_long'
        ? 'profile.displayNameTooLong'
        : bioTooLong
          ? 'profile.bioTooLong'
          : null;
  return {
    isDisplayName,
    maxLength,
    errorKey,
    invalid: Boolean(errorKey),
    unchanged: (normalize(value) ?? '') === (normalize(initialValue) ?? ''),
  };
}
