const errorKeys = new Map([
  ['same_password', 'auth.resetPasswordSameError'],
  ['weak_password', 'profile.passwordRequirementsError'],
  ['email_not_confirmed', 'profile.emailNotConfirmedError'],
  ['reauthentication_not_valid', 'profile.invalidCodeError'],
  ['reauth_nonce_missing', 'profile.verificationCodeRequired'],
  ['invalid_credentials', 'profile.currentPasswordInvalidError'],
]);

// Older Auth responses may omit the code. Keep their known wording localized too.
const legacyErrors: readonly (readonly [RegExp, string])[] = [
  [/same password|new password should be different from the old password/i, 'auth.resetPasswordSameError'],
  [/password should be at least/i, 'auth.passwordMin'],
  [/email not confirmed/i, 'profile.emailNotConfirmedError'],
  [/invalid nonce/i, 'profile.invalidCodeError'],
  [/invalid login credentials|incorrect password/i, 'profile.currentPasswordInvalidError'],
];

export function getPasswordUpdateErrorKey(error: { code?: string; message?: string }) {
  const codeKey = errorKeys.get(error.code ?? '');
  if (codeKey) return codeKey;
  const legacyKey = legacyErrors.find(([pattern]) => pattern.test(error.message ?? ''))?.[1];
  return legacyKey ?? 'auth.passwordUpdateFailed';
}
