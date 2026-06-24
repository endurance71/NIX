import {
  KeyboardAvoidingView,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Column, FieldGroup, Host, Spacer, Text as UiText } from '@expo/ui';
import {
  AuthErrorText,
  AuthFormDivider,
  AuthPrimaryButton,
  AuthSecureField,
  AuthTextField,
} from '../../components/ui/auth-form-layout';
import {
  AuthAppleSignInButton,
  AuthGoogleSignInButton,
} from '../../components/ui/auth-social-sign-in-buttons';
import { AppHost } from '../../components/ui/app-host';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ThemeColors } from '../../theme/colors';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { notifyError } from '../../lib/appNotify';
import { isSocialAuthNotConfiguredError } from '../../services/socialAuthService';
import type { SocialAuthProvider } from '../../services/socialAuthService';
import { useTranslation } from 'react-i18next';

const GAP_MD = 16;
const GAP_SM = 12;
const LOGO_MARK_SIZE = 204;
const LOGO_TEXT_SIZE = 64;
const CARD_PADDING = GAP_MD + 2;
const CARD_RADIUS = 26;

function getAuthErrorMessage(message: string, t: (key: string) => string) {
  if (message.includes('Invalid login credentials')) return t('auth.invalidCredentials');
  if (message.includes('Email not confirmed')) return t('auth.emailNotConfirmed');
  return message;
}

function LoginHero({
  colors,
  isDark,
  isIos,
  contentWidth,
  t,
}: {
  colors: ThemeColors;
  isDark: boolean;
  isIos: boolean;
  contentWidth: number;
  t: (key: string) => string;
}) {
  const scheme = isDark ? 'dark' : 'light';
  const borderColor = isIos && !isDark ? PlatformColor('separator') : colors.borderStrong;

  return (
    <View style={[styles.heroWrap, { width: contentWidth }]}>
      <View
        style={[
          styles.logoMark,
          {
            width: LOGO_MARK_SIZE,
            height: LOGO_MARK_SIZE,
            borderRadius: LOGO_MARK_SIZE / 2,
            backgroundColor: colors.surface,
            borderColor,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}>
        <Host matchContents ignoreSafeArea="all" style={styles.logoHost} colorScheme={scheme}>
          <Column style={{ width: LOGO_MARK_SIZE, height: LOGO_MARK_SIZE }} alignment="center">
            <Spacer flexible />
            <UiText textStyle={{ fontSize: LOGO_TEXT_SIZE, fontWeight: '700', color: colors.textPrimary }}>NiX</UiText>
            <Spacer flexible />
          </Column>
        </Host>
      </View>

      <Host matchContents ignoreSafeArea="all" style={styles.heroTextHost} colorScheme={scheme}>
        <Column style={{ width: contentWidth }} spacing={14} alignment="center">
          <UiText
            textStyle={{
              fontSize: 15,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 21,
            }}>
            {t('auth.tagline')}
          </UiText>
          <UiText textStyle={{ fontSize: 22, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' }}>
            {t('auth.loginTitle')}
          </UiText>
        </Column>
      </Host>
    </View>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { colors, statusBarStyle, isDark } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();

  const isIos = process.env.EXPO_OS === 'ios';
  const authBusy = loading || socialLoading !== null;
  const contentWidth = Math.max(260, windowWidth - GAP_MD * 2);
  const formInnerWidth = contentWidth - CARD_PADDING * 2;
  const cardBorderColor = isIos ? PlatformColor('separator') : colors.borderStrong;

  const handleSignIn = async () => {
    if (!email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }
    if (!password.trim()) {
      setError(t('auth.passwordRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    const { error: signInError } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);

    if (signInError) {
      notifyError(getAuthErrorMessage(signInError.message, t));
    }
  };

  const getSocialAuthNotConfiguredMessage = (provider: SocialAuthProvider) =>
    provider === 'google' ? t('auth.socialAuthNotConfiguredGoogle') : t('auth.socialAuthNotConfiguredApple');

  const handleSocialSignIn = async (provider: SocialAuthProvider) => {
    if (authBusy) return;

    setError(null);
    setSocialLoading(provider);

    const { error: socialError } =
      provider === 'google' ? await signInWithGoogle() : await signInWithApple();

    setSocialLoading(null);

    if (socialError) {
      if (isSocialAuthNotConfiguredError(socialError.message)) {
        notifyError(getSocialAuthNotConfiguredMessage(provider));
        return;
      }
      notifyError(socialError.message);
    }
  };

  const scrollContentStyle = [
    styles.scrollContent,
    {
      backgroundColor: colors.background,
      gap: GAP_MD,
      paddingBottom: Math.max(insets.bottom, GAP_MD) + 24,
    },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={statusBarStyle} />
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={isIos ? 'padding' : undefined}>
        <ScrollView
          style={[styles.flex, { backgroundColor: colors.background }]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={scrollContentStyle}>
          <LoginHero colors={colors} isDark={isDark} isIos={isIos} contentWidth={contentWidth} t={t} />

          <View
            style={[
              styles.card,
              {
                width: contentWidth,
                alignSelf: 'center',
                backgroundColor: colors.surface,
                borderColor: cardBorderColor,
                ...(isDark ? {} : { boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)' }),
              },
            ]}>
            <AppHost matchContents style={{ width: formInnerWidth }}>
              <FieldGroup.Section>
                <AuthTextField
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setError(null);
                    setEmail(value);
                  }}
                />
                <AuthSecureField
                  placeholder={t('auth.passwordPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  onChangeText={(value) => {
                    setError(null);
                    setPassword(value);
                  }}
                />
                <FieldGroup.SectionFooter>
                  <Column spacing={GAP_SM} style={{ width: formInnerWidth }}>
                    {error ? <AuthErrorText>{error}</AuthErrorText> : null}
                    <AuthPrimaryButton
                      label={loading ? t('auth.loginLoading') : t('auth.loginButton')}
                      onPress={handleSignIn}
                      disabled={authBusy}
                      style={{ width: formInnerWidth }}
                    />
                    <AuthFormDivider label={t('auth.orContinueWith')} />
                    <AuthGoogleSignInButton
                      width={formInnerWidth}
                      disabled={authBusy}
                      onPress={() => handleSocialSignIn('google')}
                    />
                    <AuthAppleSignInButton
                      width={formInnerWidth}
                      disabled={authBusy}
                      onPress={() => handleSocialSignIn('apple')}
                    />
                  </Column>
                </FieldGroup.SectionFooter>
              </FieldGroup.Section>
            </AppHost>
          </View>

          <View style={styles.links}>
            <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
              <Text style={[styles.linkLabel, { color: colors.accent }]}>{t('auth.forgotPassword')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={8}>
              <Text style={[styles.linkLabel, { color: colors.accent }]}>{t('auth.noAccount')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: GAP_MD,
    paddingTop: GAP_SM,
  },
  heroWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 14,
    paddingVertical: GAP_MD,
    backgroundColor: 'transparent',
  },
  logoMark: {
    borderCurve: 'continuous',
    overflow: 'visible',
    position: 'relative',
  },
  logoHost: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  heroTextHost: {
    backgroundColor: 'transparent',
    width: '100%',
  },
  card: {
    borderCurve: 'continuous',
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    padding: CARD_PADDING,
    gap: GAP_MD,
  },
  links: {
    gap: GAP_SM,
    alignItems: 'center',
    paddingTop: 4,
  },
  linkLabel: {
    fontSize: 17,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
  },
});
