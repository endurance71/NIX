import { FieldGroup } from '@expo/ui';
import {
  AuthErrorText,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecureField,
  AuthTextField,
  AuthTextLinkButton,
} from '../ui/auth-form-layout';
import { AuthRnBridge } from '../ui/auth-rn-bridge';
import { AuthBrandBlock } from './AuthBrandBlock';
import { AuthSocialBlock } from './AuthSocialSection';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  const registerLabel = `${vm.t('auth.noAccountPrompt')} ${vm.t('auth.noAccountLink')}`;

  return (
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthBrandBlock />
        </FieldGroup.SectionHeader>

        <AuthTextField
          nativeValue={vm.email}
          placeholder={vm.t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          onChangeText={(text) => {
            vm.onEmailChange(text);
            vm.clearError();
          }}
        />

        <AuthSecureField
          nativeValue={vm.password}
          placeholder={vm.t('auth.passwordPlaceholder')}
          autoComplete="password"
          returnKeyType="done"
          onSubmitEditing={() => void vm.handleSignIn()}
          onChangeText={(text) => {
            vm.onPasswordChange(text);
            vm.clearError();
          }}
        />

        <AuthTextLinkButton
          label={vm.t('auth.forgotPassword')}
          onPress={vm.goToForgotPassword}
        />

        {vm.error ? <AuthErrorText>{vm.error}</AuthErrorText> : null}

        <AuthPrimaryButton
          label={vm.loading ? vm.t('auth.loginLoading') : vm.t('auth.loginButton')}
          onPress={() => void vm.handleSignIn()}
          disabled={vm.authBusy}
        />

        <AuthTextLinkButton label={registerLabel} onPress={vm.goToRegister} />
      </FieldGroup.Section>

      <FieldGroup.Section>
        <FieldGroup.SectionFooter>
          <AuthRnBridge>
            <AuthSocialBlock
              dividerLabel={vm.t('auth.orContinueWith')}
              contentWidth={vm.contentWidth}
              disabled={vm.authBusy}
              showDivider={vm.showSocialDivider}
              onApplePress={() => void vm.handleSocialSignIn('apple')}
              onGooglePress={() => void vm.handleSocialSignIn('google')}
            />
          </AuthRnBridge>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}
