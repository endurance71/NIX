import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AuthActionsSection,
  AuthFooterPrompt,
  AuthFormHeader,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthTextField,
  FieldGroup,
} from '../../components/ui/auth-form-layout';
import { AuthRnBridge } from '../../components/ui/auth-rn-bridge';
import { AuthBrandBlock } from '../../components/auth/AuthBrandBlock';
import { useAuth } from '../../hooks/useAuth';

export default function CheckEmailScreen() {
  const { t } = useTranslation();
  const { verifyOTP } = useAuth();
  const { email, mode } = useLocalSearchParams<{ email?: string; mode?: 'signup' | 'recovery' }>();
  const isRecovery = mode === 'recovery';
  const emailLabel = email ?? '';

  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const title = isRecovery ? t('auth.checkEmailRecoveryTitle') : t('auth.checkEmailSignupTitle');
  const description = isRecovery
    ? t('auth.checkEmailRecoveryBody', { email: emailLabel })
    : t('auth.checkEmailSignupBody', { email: emailLabel });

  const handleVerifyOTP = async () => {
    if (!otpCode.trim()) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      const { error: verifyError } = await verifyOTP(
        emailLabel,
        otpCode.trim(),
        isRecovery ? 'recovery' : 'signup'
      );
      if (verifyError) {
        // Translate or show error
        setOtpError(verifyError.message);
      } else {
        if (isRecovery) {
          router.replace('/(auth)/reset-password');
        } else {
          router.replace('/(auth)/onboarding');
        }
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Error occurred');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <AuthFormLayout header={<AuthBrandBlock size="large" />}>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader title={title} description={description} />
        </FieldGroup.SectionHeader>

        <AuthTextField
          placeholder={t('auth.checkEmailOtpPlaceholder')}
          nativeValue={otpCode}
          onChangeText={(text) => {
            setOtpCode(text);
            setOtpError(null);
          }}
          keyboardType="number-pad"
          editable={!otpLoading}
        />

        <AuthActionsSection error={otpError}>
          <AuthPrimaryButton
            label={otpLoading ? t('auth.checkEmailOtpLoading') : t('auth.checkEmailOtpButton')}
            onPress={() => void handleVerifyOTP()}
            disabled={otpLoading || !otpCode.trim()}
          />
        </AuthActionsSection>
        
        <FieldGroup.SectionFooter>
          <AuthRnBridge>
            <AuthFooterPrompt
              prompt={t('auth.checkEmailNoAccountPrompt')}
              linkLabel={t('auth.checkEmailNoAccountLink')}
              onPress={() => router.replace('/(auth)/register')}
            />
          </AuthRnBridge>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>

      <View style={styles.footerWrap}>
        <AuthSecondaryButton
          label={t('auth.checkEmailBackToLogin')}
          onPress={() => router.replace('/(auth)/login')}
        />
      </View>
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },
});
