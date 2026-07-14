import { useEffect, useReducer } from 'react';
import { AccessibilityInfo } from 'react-native';
import { FieldGroup, Text, TextInput } from '@expo/ui';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/useAuth';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { notifySuccess } from '../../../lib/appNotify';
import {
  NativeSettingsActionRow,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';

function isReauthenticationNeededError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const code = error.code?.toLowerCase() ?? '';
  const message = error.message?.toLowerCase() ?? '';
  return code === 'reauthentication_needed' || message.includes('reauthentication');
}

function getPasswordUpdateErrorMessage(message: string, t: (key: string) => string) {
  if (message.includes('Password should be at least')) return t('profile.passwordMinimumError');
  if (message.toLowerCase().includes('same password')) return t('profile.passwordSameError');
  if (message.includes('Email not confirmed')) return t('profile.emailNotConfirmedError');
  if (message.toLowerCase().includes('invalid nonce')) return t('profile.invalidCodeError');
  if (message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('incorrect password')) {
    return t('profile.currentPasswordInvalidError');
  }
  return message;
}

type ChangePasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  nonce: string;
  requiresNonce: boolean;
  loading: boolean;
  error: string | null;
};

type ChangePasswordFormAction =
  | { type: 'field'; field: 'currentPassword' | 'newPassword' | 'confirmPassword' | 'nonce'; value: string }
  | { type: 'loading'; loading: boolean }
  | { type: 'error'; error: string | null }
  | { type: 'nonceRequired'; message: string };

const initialChangePasswordFormState: ChangePasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  nonce: '',
  requiresNonce: false,
  loading: false,
  error: null,
};

function changePasswordFormReducer(
  state: ChangePasswordFormState,
  action: ChangePasswordFormAction
): ChangePasswordFormState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value, error: null };
    case 'loading':
      return { ...state, loading: action.loading };
    case 'error':
      return { ...state, error: action.error };
    case 'nonceRequired':
      return { ...state, requiresNonce: true, loading: false, error: action.message };
    default:
      return state;
  }
}

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { session, loading: authLoading, updatePassword, reauthenticatePasswordChange } = useAuth();
  const [form, dispatchForm] = useReducer(changePasswordFormReducer, initialChangePasswordFormState);
  const { currentPassword, newPassword, confirmPassword, nonce, requiresNonce, loading, error } = form;

  useEffect(() => {
    if (!authLoading && !session) router.replace('/(auth)/login');
  }, [authLoading, session]);

  useEffect(() => {
    if (error) void AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const checks = {
    length: newPassword.length >= 8,
    digit: /\d/.test(newPassword),
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    match: confirmPassword.length > 0 && newPassword === confirmPassword,
  };
  const isSubmitDisabled =
    loading ||
    !currentPassword ||
    !checks.length ||
    !checks.digit ||
    !checks.upper ||
    !checks.lower ||
    !checks.match ||
    (requiresNonce && !nonce.trim());

  const handleSubmit = async () => {
    if (!currentPassword) {
      dispatchForm({ type: 'error', error: t('profile.currentPasswordRequired') });
      return;
    }
    if (!checks.length || !checks.digit || !checks.upper || !checks.lower) {
      dispatchForm({ type: 'error', error: t('profile.passwordRequirementsError') });
      return;
    }
    if (!checks.match) {
      dispatchForm({ type: 'error', error: t('profile.passwordMismatchError') });
      return;
    }
    if (requiresNonce && !nonce.trim()) {
      dispatchForm({ type: 'error', error: t('profile.verificationCodeRequired') });
      return;
    }

    dispatchForm({ type: 'loading', loading: true });
    dispatchForm({ type: 'error', error: null });
    const { error: updateError } = await updatePassword(
      newPassword,
      currentPassword,
      requiresNonce ? nonce.trim() : undefined
    );

    if (updateError) {
      if (!requiresNonce && isReauthenticationNeededError(updateError)) {
        const { error: reauthenticationError } = await reauthenticatePasswordChange();
        if (reauthenticationError) {
          dispatchForm({
            type: 'error',
            error: getPasswordUpdateErrorMessage(reauthenticationError.message, t),
          });
          dispatchForm({ type: 'loading', loading: false });
          return;
        }
        dispatchForm({ type: 'nonceRequired', message: t('profile.verificationCodeSent') });
        return;
      }
      dispatchForm({ type: 'error', error: getPasswordUpdateErrorMessage(updateError.message, t) });
      dispatchForm({ type: 'loading', loading: false });
      return;
    }

    dispatchForm({ type: 'loading', loading: false });
    notifySuccess(t('profile.passwordChanged'));
    router.replace('/(tabs)/profile');
  };

  return (
    <>
      <SettingsListScreen loading={authLoading}>
        <FieldGroup.Section title={t('profile.passwordSectionTitle')}>
          <TextInput
            placeholder={t('profile.currentPassword')}
            secureTextEntry
            autoComplete="current-password"
            editable={!loading}
            onChangeText={(value) => dispatchForm({ type: 'field', field: 'currentPassword', value })}
            testID="current-password"
          />
          <TextInput
            placeholder={t('profile.newPassword')}
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
            onChangeText={(value) => dispatchForm({ type: 'field', field: 'newPassword', value })}
            testID="new-password"
          />
          <TextInput
            placeholder={t('profile.confirmPassword')}
            secureTextEntry
            autoComplete="new-password"
            editable={!loading}
            onChangeText={(value) => dispatchForm({ type: 'field', field: 'confirmPassword', value })}
            testID="confirm-password"
          />
          {requiresNonce ? (
            <TextInput
              placeholder={t('profile.verificationCode')}
              secureTextEntry
              autoComplete="one-time-code"
              keyboardType="number-pad"
              editable={!loading}
              onChangeText={(value) => dispatchForm({ type: 'field', field: 'nonce', value })}
              testID="verification-code"
            />
          ) : null}
          <FieldGroup.SectionFooter>
            <Text>{t('profile.passwordDescription')}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        <NativeSettingsSection title={t('profile.passwordRequirements')}>
          <PasswordRequirementRow
            label={t('profile.passwordLengthRequirement')}
            checked={checks.length}
            successColor={colors.success}
            mutedColor={colors.tertiaryLabel}
          />
          <PasswordRequirementRow
            label={t('profile.passwordDigitRequirement')}
            checked={checks.digit}
            successColor={colors.success}
            mutedColor={colors.tertiaryLabel}
          />
          <PasswordRequirementRow
            label={t('profile.passwordUpperRequirement')}
            checked={checks.upper}
            successColor={colors.success}
            mutedColor={colors.tertiaryLabel}
          />
          <PasswordRequirementRow
            label={t('profile.passwordLowerRequirement')}
            checked={checks.lower}
            successColor={colors.success}
            mutedColor={colors.tertiaryLabel}
          />
          <PasswordRequirementRow
            label={t('profile.passwordMatchRequirement')}
            checked={checks.match}
            successColor={colors.success}
            mutedColor={colors.tertiaryLabel}
          />
        </NativeSettingsSection>

        <FieldGroup.Section>
          <NativeSettingsActionRow
            title={loading ? t('profile.savingPassword') : t('profile.savePassword')}
            disabled={isSubmitDisabled}
            onPress={() => void handleSubmit()}
          />
          {error ? (
            <FieldGroup.SectionFooter>
              <Text textStyle={{ color: colors.destructive }}>{error}</Text>
            </FieldGroup.SectionFooter>
          ) : null}
        </FieldGroup.Section>
      </SettingsListScreen>
      <Stack.Screen.Title>{t('profile.changePassword')}</Stack.Screen.Title>
    </>
  );
}

function PasswordRequirementRow({
  label,
  checked,
  successColor,
  mutedColor,
}: {
  label: string;
  checked: boolean;
  successColor: string;
  mutedColor: string;
}) {
  return (
    <NativeSettingsRow
      title={label}
      icon={checked ? 'checkCircle' : 'circle'}
      iconColor={checked ? successColor : mutedColor}
      disabled={!checked}
    />
  );
}
