type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  nonce: string;
  requiresNonce: boolean;
  loading: boolean;
};

export function getPasswordFormDecision(form: PasswordForm, canUseNetworkSession: boolean) {
  const checks = {
    length: form.newPassword.length >= 8,
    digit: /\d/.test(form.newPassword),
    upper: /[A-Z]/.test(form.newPassword),
    lower: /[a-z]/.test(form.newPassword),
    match: form.confirmPassword.length > 0 && form.newPassword === form.confirmPassword,
  };
  let validationError: string | null = null;
  if (!form.currentPassword) validationError = 'profile.currentPasswordRequired';
  else if (!checks.length || !checks.digit || !checks.upper || !checks.lower)
    validationError = 'profile.passwordRequirementsError';
  else if (!checks.match) validationError = 'profile.passwordMismatchError';
  else if (form.requiresNonce && !form.nonce.trim())
    validationError = 'profile.verificationCodeRequired';
  return {
    checks,
    validationError,
    isSubmitDisabled: !canUseNetworkSession || form.loading || Boolean(validationError),
  };
}
