import { router } from 'expo-router';
import { useState } from 'react';
import { FieldGroup } from '@expo/ui';
import { useTranslation } from 'react-i18next';
import { isUsernameTaken, saveUsernameForCurrentUser } from '../../services/profileService';
import {
  AuthActionsSection,
  AuthFormHeader,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthTertiaryText,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
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
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthFormHeader
            title={t('auth.onboardingHeader')}
            description={t('auth.onboardingDescription')}
          />
        </FieldGroup.SectionHeader>

        <AuthTextField
          nativeValue={username}
          placeholder={t('auth.onboardingPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(text) => {
            onUsernameChange(text);
            clearError();
          }}
        />
      </FieldGroup.Section>

      <FieldGroup.Section>
        <AuthTertiaryText>{t('auth.onboardingHint')}</AuthTertiaryText>
        <AuthActionsSection error={error}>
          <AuthPrimaryButton
            label={loading ? t('auth.onboardingLoading') : t('auth.onboardingSubmit')}
            onPress={() => void handleSetUsername()}
            disabled={loading}
          />
        </AuthActionsSection>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}
