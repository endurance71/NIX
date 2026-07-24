import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { VStack } from '@expo/ui/swift-ui';
import { isUsernameTaken, getCurrentUserProfile, saveUsernameForCurrentUser, updateCurrentUserProfile } from '../../services/profileService';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFormLayout,
  AuthSecondaryButton,
  AuthTertiaryText,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import { AuthPrimaryButton } from '../../components/ui/auth-primary-button';
import { useAuth } from '../../hooks/useAuth';
import { useTrackedUsername } from '../../hooks/useAuthCredentials';
import { notifyDomainError } from '../../lib/appNotify';
import { normalizeUsername } from '../../services/friendService';
import { runWithFinally } from '../../lib/runWithFinally';
import { queryKeys } from '../../lib/queryKeys';
import { isAtLeastMinimumAge, isValidBirthDate } from '../../lib/ageGate';
import { hasCurrentAgeAttestation, recordCurrentAgeAttestation } from '../../services/safetyService';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const { username, onUsernameChange, getUsername } = useTrackedUsername();
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = loading || signOutLoading;
  const { data: ageAttested = false } = useQuery({
    queryKey: queryKeys.currentAgeAttestation,
    queryFn: hasCurrentAgeAttestation,
  });
  const { data: currentProfile } = useQuery({
    queryKey: queryKeys.currentUserProfile,
    queryFn: getCurrentUserProfile,
  });

  const clearError = () => {
    setError(null);
  };

  const handleSetUsername = async () => {
    const cleaned = normalizeUsername(getUsername());
    const cleanedDisplayName = displayName.trim();
    if (!ageAttested && !isValidBirthDate(birthDate)) {
      setError(t('auth.birthDateInvalid'));
      return;
    }
    if (!ageAttested && !isAtLeastMinimumAge(birthDate)) {
      setError(t('auth.minimumAgeRequired'));
      return;
    }
    if (!currentProfile?.username) {
      if (cleanedDisplayName.length === 0) {
        setError(t('auth.displayNameRequired', 'Wpisz nazwę wyświetlaną.'));
        return;
      }
      if (cleaned.length < 3) {
        setError(t('auth.onboardingUsernameMin'));
        return;
      }
    }

    setLoading(true);
    setError(null);

    await runWithFinally(
      async () => {
        if (!ageAttested) {
          await recordCurrentAgeAttestation();
          queryClient.setQueryData(queryKeys.currentAgeAttestation, true);
        }

        if (!currentProfile?.username) {
          const taken = await isUsernameTaken(cleaned);
          if (taken) {
            setError(t('auth.onboardingUsernameTaken'));
            return;
          }
          await saveUsernameForCurrentUser(cleaned);
          await updateCurrentUserProfile({ display_name: cleanedDisplayName });
        }

        await queryClient.refetchQueries({ queryKey: queryKeys.currentUserProfile });
        router.replace('/(tabs)');
      },
      () => setLoading(false)
    ).catch((err: any) => {
      setError(`Błąd: ${err?.message || JSON.stringify(err)}`);
    });
  };

  const handleUseOtherAccount = async () => {
    setSignOutLoading(true);
    await runWithFinally(
      async () => {
        await signOut();
        queryClient.clear();
        router.replace('/(auth)/login');
      },
      () => setSignOutLoading(false)
    );
  };

  return (
    <AuthFormLayout description={t('auth.onboardingDescription')}>
      {!ageAttested ? (
        <AuthFieldGroup
          footer={<AuthTertiaryText>{t('auth.birthDatePrivacyHint')}</AuthTertiaryText>}>
          <AuthTextField
            nativeValue={birthDate}
            placeholder={t('auth.birthDatePlaceholder')}
            keyboardType="numbers-and-punctuation"
            returnKeyType={currentProfile?.username ? 'go' : 'next'}
            onSubmitEditing={() => {
              if (currentProfile?.username) void handleSetUsername();
            }}
            onChangeText={(text) => {
              setBirthDate(text);
              clearError();
            }}
            editable={!busy}
            testID="onboarding-birth-date"
          />
        </AuthFieldGroup>
      ) : null}
      {!currentProfile?.username ? (
        <>
          <AuthFieldGroup
            footer={
              <VStack alignment="leading" spacing={6}>
                <AuthTertiaryText>
                  {t('auth.displayNameHint', 'Widoczna dla Twoich znajomych. Możesz ją później zmienić w profilu.')}
                </AuthTertiaryText>
              </VStack>
            }>
            <AuthTextField
              nativeValue={displayName}
              placeholder={t('auth.displayNamePlaceholder', 'Nazwa wyświetlana')}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onChangeText={(text) => {
                setDisplayName(text);
                clearError();
              }}
              editable={!busy}
              testID="onboarding-display-name"
            />
          </AuthFieldGroup>

          <AuthFieldGroup
            footer={
              <VStack alignment="leading" spacing={6}>
                <AuthTertiaryText>
                  {t('auth.onboardingHint', 'Unikalny login (@nazwa). Służy do szukania Cię przez znajomych i nie można go zmienić.')}
                </AuthTertiaryText>
              </VStack>
            }>
            <AuthTextField
              nativeValue={username}
              placeholder={t('auth.onboardingPlaceholder', 'Login (@nazwa)')}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void handleSetUsername()}
              onChangeText={(text) => {
                onUsernameChange(text);
                clearError();
              }}
              editable={!busy}
              testID="onboarding-username"
            />
          </AuthFieldGroup>
        </>
      ) : null}

      {error ? <AuthErrorText>{error}</AuthErrorText> : null}

      <AuthPrimaryButton
        label={currentProfile?.username ? t('auth.ageGateSubmit') : t('auth.onboardingSubmit')}
        loading={loading}
        onPress={() => void handleSetUsername()}
        disabled={busy}
      />
      <AuthSecondaryButton
        label={t('auth.onboardingUseOtherAccount')}
        onPress={() => void handleUseOtherAccount()}
      />
    </AuthFormLayout>
  );
}
