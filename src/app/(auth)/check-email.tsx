import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AuthEmailDescription,
  AuthErrorText,
  AuthFieldGroup,
  AuthFormLayout,
  AuthSecondaryButton,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';
import { useAuth } from '../../hooks/useAuth';
import { runWithFinally } from '../../lib/runWithFinally';
import { getAuthFormErrorKey } from '../../lib/authFormError';
import { notifySuccess } from '../../lib/appNotify';

const RESEND_COOLDOWN_MS = 60_000;

export default function CheckEmailScreen() {
  const { t } = useTranslation();
  const { verifyOTP, requestPasswordReset, resendSignupConfirmation } = useAuth();
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const isRecovery = mode === 'recovery';
  const emailLabel = email ?? '';

  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  // The first email was just sent by the previous screen, so the cooldown starts right away.
  const [resendAvailableAt, setResendAvailableAt] = useState(() => Date.now() + RESEND_COOLDOWN_MS);
  const [now, setNow] = useState(() => Date.now());
  const [resendLoading, setResendLoading] = useState(false);
  const resendSecondsLeft = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    if (resendAvailableAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAvailableAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  const handleResend = async () => {
    if (!emailLabel || resendLoading || resendSecondsLeft > 0) return;
    setResendLoading(true);
    setOtpError(null);
    await runWithFinally(
      async () => {
        const { error: resendError } = isRecovery
          ? await requestPasswordReset(emailLabel)
          : await resendSignupConfirmation(emailLabel);
        if (resendError) {
          setOtpError(t(getAuthFormErrorKey(resendError)));
          return;
        }
        notifySuccess(t('auth.checkEmailResent'));
        const sentAt = Date.now();
        setNow(sentAt);
        setResendAvailableAt(sentAt + RESEND_COOLDOWN_MS);
      },
      () => setResendLoading(false)
    );
  };

  const navigationTitle = isRecovery ? t('auth.checkEmailRecoveryTitle') : t('auth.checkEmailSignupTitle');
  const description = isRecovery
    ? t('auth.checkEmailRecoveryBody', { email: emailLabel })
    : t('auth.checkEmailSignupBody', { email: emailLabel });

  const handleVerifyOTP = async () => {
    if (!otpCode.trim()) return;
    setOtpLoading(true);
    setOtpError(null);
    await runWithFinally(
      async () => {
        try {
          const { error: verifyError } = await verifyOTP(
            emailLabel,
            otpCode.trim(),
            isRecovery ? 'recovery' : 'signup'
          );
          if (verifyError) {
            setOtpError(t(getAuthFormErrorKey(verifyError)));
          } else if (isRecovery) {
            router.replace('/(auth)/reset-password');
          } else {
            router.replace('/(auth)/onboarding');
          }
        } catch (err: unknown) {
          setOtpError(t(getAuthFormErrorKey(err instanceof Error ? err : null)));
        }
      },
      () => {
        setOtpLoading(false);
      }
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: navigationTitle, headerShown: true }} />
      <AuthFormLayout>
        <AuthEmailDescription body={description} email={emailLabel} />

        <AuthFieldGroup>
          <AuthTextField
            placeholder={t('auth.checkEmailOtpPlaceholder')}
            nativeValue={otpCode}
            onChangeText={(text) => {
              setOtpCode(text);
              setOtpError(null);
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            returnKeyType="go"
            onSubmitEditing={() => void handleVerifyOTP()}
            editable={!otpLoading}
            testID="check-email-code"
          />
        </AuthFieldGroup>

        {otpError ? <AuthErrorText>{otpError}</AuthErrorText> : null}

        <AuthPrimaryButton
          label={t('auth.checkEmailOtpButton')}
          loading={otpLoading}
          onPress={() => void handleVerifyOTP()}
          disabled={otpLoading || !otpCode.trim()}
        />
        <AuthSecondaryButton
          label={
            resendSecondsLeft > 0
              ? t('auth.checkEmailResendIn', { seconds: resendSecondsLeft })
              : t('auth.checkEmailResend')
          }
          disabled={!emailLabel || resendLoading || resendSecondsLeft > 0}
          onPress={() => void handleResend()}
        />
        <AuthSecondaryButton
          label={t('auth.checkEmailBackToLogin')}
          onPress={() => router.dismissTo('/(auth)/login')}
        />
      </AuthFormLayout>
    </>
  );
}
