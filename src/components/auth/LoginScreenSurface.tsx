import { useRef } from 'react';
import type { TextInputRef } from '@expo/ui';
import { VStack } from '@expo/ui/swift-ui';
import { frame, padding } from '@expo/ui/swift-ui/modifiers';
import {
  AuthErrorText,
  AuthFieldGroup,
  AuthFooterPrompt,
  AuthFormDivider,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecureField,
  AuthTextField,
  AuthTrailingLink,
  useAuthContentWidth,
} from '../ui/auth-form-layout';
import { AuthAppleSignInButton } from '../ui/auth-apple-sign-in-button';
import {
  AUTH_LOGIN_CTA_TO_PROMPT_GAP,
  AUTH_LOGIN_FORM_INNER_GAP,
  AUTH_LOGIN_FORM_TO_CTA_GAP,
  AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP,
} from '../../theme/authLayout';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  const passwordRef = useRef<TextInputRef>(null);

  return (
    <AuthFormLayout variant="login" title={vm.t('auth.loginTitle')}>
      <LoginScreenBody vm={vm} passwordRef={passwordRef} />
    </AuthFormLayout>
  );
}

type LoginScreenBodyProps = {
  vm: LoginScreenViewModel;
  passwordRef: React.RefObject<TextInputRef | null>;
};

function LoginScreenBody({ vm, passwordRef }: LoginScreenBodyProps) {
  const contentWidth = useAuthContentWidth();

  return (
    <VStack alignment="leading" spacing={0} modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
      <VStack alignment="leading" spacing={AUTH_LOGIN_FORM_INNER_GAP}>
        <AuthFieldGroup>
          <AuthTextField
            nativeValue={vm.email}
            placeholder={vm.t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoComplete="email"
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
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={() => void vm.handleSignIn()}
            onChangeText={(text) => {
              vm.onPasswordChange(text);
              vm.clearError();
            }}
            editable={!vm.authBusy}
            testID="login-password"
          />
        </AuthFieldGroup>

        {vm.error ? <AuthErrorText>{vm.error}</AuthErrorText> : null}
        <AuthTrailingLink label={vm.t('auth.forgotPassword')} onPress={vm.goToForgotPassword} />
      </VStack>

      <VStack
        alignment="leading"
        spacing={AUTH_LOGIN_CTA_TO_PROMPT_GAP}
        modifiers={[padding({ top: AUTH_LOGIN_FORM_TO_CTA_GAP })]}>
        <AuthPrimaryButton
          label={vm.t('auth.loginButton')}
          loading={vm.loading}
          onPress={() => void vm.handleSignIn()}
          disabled={vm.authBusy}
        />

        <AuthFooterPrompt
          prompt={vm.t('auth.noAccountPrompt')}
          linkLabel={vm.t('auth.noAccountLink')}
          onPress={vm.goToRegister}
        />
      </VStack>

      {vm.showAppleSignIn ? (
        <VStack
          alignment="leading"
          spacing={AUTH_LOGIN_FORM_INNER_GAP}
          modifiers={[padding({ top: AUTH_LOGIN_PROMPT_TO_SOCIAL_GAP })]}>
          <AuthFormDivider label={vm.t('auth.orContinueWith')} />
          <AuthAppleSignInButton disabled={vm.authBusy} onPress={() => void vm.handleAppleSignIn()} />
        </VStack>
      ) : null}
    </VStack>
  );
}
