import { useState, type RefObject } from 'react';
import type { TextInputRef } from '@expo/ui';
import { HStack, VStack } from '@expo/ui/swift-ui';
import { frame, padding } from '@expo/ui/swift-ui/modifiers';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthSecureField,
  AuthTextField,
  AuthTextLink,
} from '../../ui/auth-form-layout';
import { useAuthContentWidth } from '../../ui/auth-content-width';
import {
  AUTH_LOGIN_FORM_TO_FORGOT_GAP,
  AUTH_LOGIN_HERO_TO_FORM_GAP,
} from '../../../theme/authLayout';
import type { LoginScreenViewModel } from '../../../hooks/useLoginScreen';

type LoginCredentialsSectionProps = {
  vm: LoginScreenViewModel;
  passwordRef: RefObject<TextInputRef | null>;
};

export function LoginCredentialsSection({ vm, passwordRef }: LoginCredentialsSectionProps) {
  const [passwordShown, setPasswordShown] = useState(false);
  const contentWidth = useAuthContentWidth();

  return (
    <VStack
      alignment="leading"
      spacing={AUTH_LOGIN_FORM_TO_FORGOT_GAP}
      modifiers={[
        frame({ width: contentWidth, alignment: 'leading' }),
        padding({ top: AUTH_LOGIN_HERO_TO_FORM_GAP }),
      ]}>
      <AuthFieldGroup>
        <AuthTextField
          nativeValue={vm.email}
          placeholder={vm.t('auth.emailPlaceholder')}
          keyboardType="email-address"
          // `username` (not `email`) pairs this field with the password for iCloud Keychain
          // AutoFill and „Save password” (webcredentials associated domain).
          autoComplete="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          onChangeText={(text) => {
            vm.onEmailChange(text);
            vm.clearError();
          }}
          editable={!vm.authBusy}
          testID="login-email"
        />
        <AuthSecureField
          ref={passwordRef}
          nativeValue={vm.password}
          placeholder={vm.t('auth.passwordPlaceholder')}
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void vm.handleSignIn()}
          onChangeText={(text) => {
            vm.onPasswordChange(text);
            vm.clearError();
          }}
          editable={!vm.authBusy}
          testID="login-password"
          revealed={passwordShown}
          revealToggle={{
            revealed: passwordShown,
            onToggle: () => setPasswordShown((value) => !value),
            showLabel: vm.t('auth.showPassword'),
            hideLabel: vm.t('auth.hidePassword'),
          }}
        />
      </AuthFieldGroup>

      {vm.error ? <AuthErrorText>{vm.error}</AuthErrorText> : null}
      <HStack
        alignment="center"
        spacing={0}
        modifiers={[frame({ width: contentWidth, minHeight: 44, alignment: 'leading' })]}>
        <AuthTextLink label={vm.t('auth.forgotPassword')} onPress={vm.goToForgotPassword} />
      </HStack>
    </VStack>
  );
}
