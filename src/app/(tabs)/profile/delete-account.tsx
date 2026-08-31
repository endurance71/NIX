import { useEffect, useState } from 'react';
import { FieldGroup, Text, TextInput } from '@expo/ui';
import { Stack, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { userHasAppleIdentity, userHasEmailPasswordIdentity } from '../../../lib/authProviders';
import { reauthenticateForAccountDeletion } from '../../../lib/accountDeletionReauthentication';
import { clearMediaMemoryCache } from '../../../lib/mediaCache';
import { clearUploadQueueNixeshot } from '../../../lib/uploadQueuePersistence';
import { clearPendingViewedAcks } from '../../../lib/viewedAckQueue';
import { getCurrentUserProfile, type CurrentUserProfileRow } from '../../../services/profileService';
import { deleteCurrentAccount } from '../../../services/accountService';
import { reauthenticateAppleForAccountDeletion } from '../../../services/socialAuthService';
import { NativeSettingsActionRow } from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { runWithFinally } from '../../../lib/runWithFinally';
import { queryKeys } from '../../../lib/queryKeys';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { user, loading: authLoading, signIn, signOut, canUseNetworkSession } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPassword = userHasEmailPasswordIdentity(user);
  const hasApple = userHasAppleIdentity(user);

  const { data: profile = null } = useQuery<CurrentUserProfileRow | null>({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    enabled: canUseNetworkSession,
  });
  const username = profile?.username ?? '';
  useEffect(() => {
    if (!authLoading && !user) router.replace('/(auth)/login');
  }, [authLoading, user]);

  const confirmationMatches = Boolean(username) && confirmation.trim().replace(/^@/, '') === username;
  const disabled = !canUseNetworkSession || loading || !confirmationMatches || (hasPassword && !password);

  const removeAccount = async () => {
    if (!confirmationMatches) return setError(t('profile.deleteAccountConfirmationError'));
    if (hasPassword && !password) return setError(t('profile.deleteAccountPasswordError'));
    if (!user) return;

    setLoading(true);
    setError(null);
    await runWithFinally(
      async () => {
        try {
          const { appleAuthorizationCode } = await reauthenticateForAccountDeletion({
            hasPassword,
            hasApple,
            email: user.email,
            password,
            signIn,
            requestAppleAuthorization: reauthenticateAppleForAccountDeletion,
          });
          await deleteCurrentAccount({ appleAuthorizationCode });
          await Promise.allSettled([
            clearUploadQueueNixeshot(),
            clearPendingViewedAcks(user.id),
            clearMediaMemoryCache(),
          ]);
          queryClient.clear();
          await signOut();
          router.replace('/(auth)/login');
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : '';
          if (message === 'APPLE_SIGN_IN_NO_AUTHORIZATION_CODE') {
            setError(t('profile.deleteAccountAppleCodeError'));
          } else if (message && !/authorizationcode|client_secret|identity.token/i.test(message)) {
            setError(message);
          } else {
            setError(t('profile.deleteAccountFailed'));
          }
        }
      },
      () => setLoading(false)
    );
  };

  return (
    <>
      <SettingsListScreen loading={authLoading}>
        <FieldGroup.Section title={t('profile.deleteAccountTitle')}>
          <FieldGroup.SectionFooter>
            <Text>{t('profile.deleteAccountDescription')}</Text>
          </FieldGroup.SectionFooter>
          <TextInput
            placeholder={t('profile.deleteAccountConfirmLabel')}
            autoCapitalize="none"
            editable={canUseNetworkSession && !loading}
            onChangeText={(value) => {
              setConfirmation(value);
              setError(null);
            }}
            testID="delete-account-confirmation"
          />
          {hasPassword ? (
            <TextInput
              placeholder={t('profile.deleteAccountPasswordLabel')}
              secureTextEntry
              autoComplete="current-password"
              editable={canUseNetworkSession && !loading}
              onChangeText={(value) => {
                setPassword(value);
                setError(null);
              }}
              testID="delete-account-password"
            />
          ) : null}
          {hasApple ? (
            <FieldGroup.SectionFooter>
              <Text>{t('profile.deleteAccountReauthenticateApple')}</Text>
            </FieldGroup.SectionFooter>
          ) : null}
        </FieldGroup.Section>
        <FieldGroup.Section>
          <NativeSettingsActionRow
            title={loading ? t('profile.deleteAccountProcessing') : t('profile.deleteAccountAction')}
            disabled={disabled}
            onPress={() => void removeAccount()}
          />
          {error ? (
            <FieldGroup.SectionFooter>
              <Text textStyle={{ color: colors.destructive }}>{error}</Text>
            </FieldGroup.SectionFooter>
          ) : null}
        </FieldGroup.Section>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('profile.deleteAccount')}</Stack.Screen.Title>
    </>
  );
}
