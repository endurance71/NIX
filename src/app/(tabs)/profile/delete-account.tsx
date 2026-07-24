import { useEffect, useState } from 'react';
import { FieldGroup, Text, TextInput } from '@expo/ui';
import { Stack, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { userHasEmailPasswordIdentity } from '../../../lib/authProviders';
import { reauthenticateForAccountDeletion } from '../../../lib/accountDeletionReauthentication';
import { clearMediaMemoryCache } from '../../../lib/mediaCache';
import { clearUploadQueueNixeshot } from '../../../lib/uploadQueuePersistence';
import { clearPendingViewedAcks } from '../../../lib/viewedAckQueue';
import { getCurrentUserProfile } from '../../../services/profileService';
import { deleteCurrentAccount } from '../../../services/accountService';
import { NativeSettingsActionRow } from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { runWithFinally } from '../../../lib/runWithFinally';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { user, loading: authLoading, signIn, signInWithApple, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPassword = userHasEmailPasswordIdentity(user);

  useEffect(() => {
    void getCurrentUserProfile().then((profile) => setUsername(profile?.username ?? ''));
  }, []);
  useEffect(() => {
    if (!authLoading && !user) router.replace('/(auth)/login');
  }, [authLoading, user]);

  const confirmationMatches = Boolean(username) && confirmation.trim().replace(/^@/, '') === username;
  const disabled = loading || !confirmationMatches || (hasPassword && !password);

  const removeAccount = async () => {
    if (!confirmationMatches) return setError(t('profile.deleteAccountConfirmationError'));
    if (hasPassword && !password) return setError(t('profile.deleteAccountPasswordError'));
    if (!user) return;

    setLoading(true);
    setError(null);
    await runWithFinally(
      async () => {
        try {
          await reauthenticateForAccountDeletion({
            hasPassword,
            email: user.email,
            password,
            signIn,
            signInWithApple,
          });

          await deleteCurrentAccount();
          await Promise.allSettled([
            clearUploadQueueNixeshot(),
            clearPendingViewedAcks(user.id),
            clearMediaMemoryCache(),
          ]);
          queryClient.clear();
          await signOut();
          router.replace('/(auth)/login');
        } catch (cause) {
          setError(
            cause instanceof Error && cause.message ? cause.message : t('profile.deleteAccountFailed')
          );
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
            editable={!loading}
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
              editable={!loading}
              onChangeText={(value) => {
                setPassword(value);
                setError(null);
              }}
              testID="delete-account-password"
            />
          ) : (
            <FieldGroup.SectionFooter>
              <Text>{t('profile.deleteAccountReauthenticateApple')}</Text>
            </FieldGroup.SectionFooter>
          )}
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
