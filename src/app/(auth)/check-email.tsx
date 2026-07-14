import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AuthEmailDescription,
  AuthErrorText,
  AuthFieldGroup,
  AuthFooterPrompt,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { useAuth } from '../../hooks/useAuth';
import { runWithFinally } from '../../lib/runWithFinally';

export default function CheckEmailScreen() {
  const { t } = useTranslation();
  const { verifyOTP } = useAuth();
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const isRecovery = mode === 'recovery';
  const emailLabel = email ?? '';

  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

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
            setOtpError(verifyError.message);
          } else if (isRecovery) {
            router.replace('/(auth)/reset-password');
          } else {
            router.replace('/(auth)/onboarding');
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Error occurred';
          setOtpError(message);
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
      <AuthFormLayout variant="secondary">
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
        <AuthFooterPrompt
          prompt={t('auth.checkEmailNoAccountPrompt')}
          linkLabel={t('auth.checkEmailNoAccountLink')}
          onPress={() => router.replace('/(auth)/register')}
        />
        <AuthSecondaryButton
          label={t('auth.checkEmailBackToLogin')}
          onPress={() => router.replace('/(auth)/login')}
        />
      </AuthFormLayout>
    </>
  );
}
