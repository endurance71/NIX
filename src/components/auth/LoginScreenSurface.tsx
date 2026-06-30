import { StyleSheet, View } from 'react-native';
import {
  AuthActionsSection,
  AuthFormDivider,
  AuthFormLayout,
  AuthPrimaryButton,
  AuthSecureField,
  AuthTextField,
  AuthSecondaryButton,
  FieldGroup,
} from '../ui/auth-form-layout';
import {
  AuthAppleSignInButton,
  AuthGoogleSignInButton,
} from '../ui/auth-social-sign-in-buttons';
import { AuthBrandBlock } from './AuthBrandBlock';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  return (
    <AuthFormLayout
      header={<AuthBrandBlock size="large" />}
      contentVerticalAlignment="center"
    >
      {/* Sekcja 1: Pojedyncza karta dla pól i głównego przycisku */}
      <FieldGroup.Section>
        <AuthTextField
          nativeValue={vm.email}
          placeholder={vm.t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoComplete="email"
          onChangeText={(text) => {
            vm.onEmailChange(text);
            vm.clearError();
          }}
          editable={!vm.authBusy}
        />

        <AuthSecureField
          nativeValue={vm.password}
          placeholder={vm.t('auth.passwordPlaceholder')}
          autoComplete="password"
          onChangeText={(text) => {
            vm.onPasswordChange(text);
            vm.clearError();
          }}
          editable={!vm.authBusy}
        />

        <AuthActionsSection error={vm.error}>
          <AuthPrimaryButton
            label={vm.loading ? vm.t('auth.loginLoading') : vm.t('auth.loginButton')}
            onPress={() => void vm.handleSignIn()}
            disabled={vm.authBusy}
          />
        </AuthActionsSection>
      </FieldGroup.Section>

      {/* Akcje dodatkowe i logowanie społecznościowe */}
      <View style={styles.footerWrap}>
        <AuthSecondaryButton
          label={vm.t('auth.forgotPassword')}
          onPress={vm.goToForgotPassword}
        />

        <View style={styles.registerSlot}>
          <AuthSecondaryButton
            label={`${vm.t('auth.noAccountPrompt')} ${vm.t('auth.noAccountLink')}`}
            onPress={vm.goToRegister}
          />
        </View>

        {vm.showSocialDivider || true ? (
          <View style={styles.socialBlock}>
            <AuthFormDivider label={vm.t('auth.orContinueWith')} />
            
            {vm.showSocialDivider ? (
              <View style={styles.appleSlot}>
                <AuthAppleSignInButton
                  width={vm.contentWidth}
                  disabled={vm.authBusy}
                  onPress={() => void vm.handleSocialSignIn('apple')}
                />
              </View>
            ) : null}

            <AuthGoogleSignInButton
              width={vm.contentWidth}
              disabled={vm.authBusy}
              onPress={() => void vm.handleSocialSignIn('google')}
            />
          </View>
        ) : null}
      </View>
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    width: '100%',
    alignItems: 'stretch',
    paddingTop: 8,
    paddingBottom: 24,
  },
  registerSlot: {
    marginTop: 4,
    marginBottom: 4,
  },
  socialBlock: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  appleSlot: {
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
});
