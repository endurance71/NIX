import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VStack } from '@expo/ui/swift-ui';
import { isUsernameTaken, saveUsernameForCurrentUser } from '../../services/profileService';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFormLayout,
  AuthTertiaryText,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';
import { useTrackedUsername } from '../../hooks/useAuthCredentials';
import { notifyDomainError } from '../../lib/appNotify';
import { normalizeUsername } from '../../services/friendService';
import { runWithFinally } from '../../lib/runWithFinally';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { username, onUsernameChange, getUsername } = useTrackedUsername();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    setError(null);
  };

  const handleSetUsername = async () => {
    const cleaned = normalizeUsername(getUsername());
    if (cleaned.length < 3) {
      setError(t('auth.onboardingUsernameMin'));
      return;
    }

    setLoading(true);
    setError(null);

    await runWithFinally(
      async () => {
        const taken = await isUsernameTaken(cleaned);
        if (taken) {
          setError(t('auth.onboardingUsernameTaken'));
          return;
        }

        await saveUsernameForCurrentUser(cleaned);
        router.replace('/(tabs)');
      },
      () => setLoading(false)
    ).catch((err: unknown) => {
      notifyDomainError(err, t('auth.onboardingSaveFailed'));
    });
  };

  return (
    <AuthFormLayout description={t('auth.onboardingDescription')}>
      <AuthFieldGroup
        footer={
          <VStack alignment="leading" spacing={6}>
            <AuthTertiaryText>{t('auth.onboardingHint')}</AuthTertiaryText>
          </VStack>
        }>
        <AuthTextField
          nativeValue={username}
          placeholder={t('auth.onboardingPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => void handleSetUsername()}
          onChangeText={(text) => {
            onUsernameChange(text);
            clearError();
          }}
          editable={!loading}
          testID="onboarding-username"
        />
      </AuthFieldGroup>

      {error ? <AuthErrorText>{error}</AuthErrorText> : null}

      <AuthPrimaryButton
        label={t('auth.onboardingSubmit')}
        loading={loading}
        onPress={() => void handleSetUsername()}
        disabled={loading}
      />
    </AuthFormLayout>
  );
}
