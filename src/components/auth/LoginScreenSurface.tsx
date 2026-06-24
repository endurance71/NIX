import { StyleSheet, View } from 'react-native';
import { FieldGroup } from '@expo/ui';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AuthErrorText,
  AuthFormDivider,
  AuthFormLayout,
  AuthFormFooter,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSecureField,
  AuthTextField,
} from '../ui/auth-form-layout';
import {
  AuthAppleSignInButton,
  AuthGoogleSignInButton,
} from '../ui/auth-social-sign-in-buttons';
import { AuthBrandHeader } from './AuthBrandHeader';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';
import { AUTH_SECTION_GAP } from '../../theme/authLayout';

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  return (
    <AuthFormLayout>
      <FieldGroup.Section>
        <FieldGroup.SectionHeader>
          <AuthBrandHeader />
        </FieldGroup.SectionHeader>

        <AuthTextField
          nativeValue={vm.email}
          placeholder={vm.t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          icon="email"
          onChangeText={vm.clearError}
        />

        <AuthSecureField
          nativeValue={vm.password}
          placeholder={vm.t('auth.passwordPlaceholder')}
          autoComplete="password"
          returnKeyType="done"
          icon="lock"
          onSubmitEditing={() => void vm.handleSignIn()}
          onChangeText={vm.clearError}
        />

        <FieldGroup.SectionFooter>
          <AuthFormFooter>
            {vm.error ? <AuthErrorText>{vm.error}</AuthErrorText> : null}

            <AuthPrimaryButton
              label={vm.loading ? vm.t('auth.loginLoading') : vm.t('auth.loginButton')}
              onPress={() => void vm.handleSignIn()}
              disabled={vm.authBusy}
              style={{ width: vm.contentWidth }}
            />

            <Animated.View entering={FadeInDown.delay(100).duration(600).springify()} style={{ width: '100%', alignItems: 'center' }}>
              <View style={styles.socialBlock}>
                <AuthFormDivider label={vm.t('auth.orContinueWith')} />
                <AuthAppleSignInButton
                  width={vm.contentWidth}
                  disabled={vm.authBusy}
                  onPress={() => void vm.handleSocialSignIn('apple')}
                />
                <AuthGoogleSignInButton
                  width={vm.contentWidth}
                  disabled={vm.authBusy}
                  onPress={() => void vm.handleSocialSignIn('google')}
                />
              </View>
            </Animated.View>

            <View style={styles.linksBlock}>
              <AuthSecondaryButton
                label={vm.t('auth.forgotPassword')}
                onPress={vm.goToForgotPassword}
                style={{ width: vm.contentWidth }}
              />
              <AuthSecondaryButton
                label={vm.t('auth.noAccount')}
                onPress={vm.goToRegister}
                style={{ width: vm.contentWidth }}
              />
            </View>
          </AuthFormFooter>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  footerContainer: {
    paddingTop: 16,
    gap: 16,
    alignItems: 'center',
  },
  socialBlock: {
    gap: AUTH_SECTION_GAP,
    alignItems: 'center',
    width: '100%',
  },
  linksBlock: {
    paddingTop: 8,
    gap: 8,
    alignItems: 'center',
    width: '100%',
  },
});

