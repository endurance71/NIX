import { useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AuthAppleSignInButton,
  AuthGoogleSignInButton,
} from '../ui/auth-social-sign-in-buttons';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { LoginScreenViewModel } from '../../hooks/useLoginScreen';
import {
  AUTH_BRAND_FRAME_SIZE,
  AUTH_BRAND_ICON_SIZE,
  AUTH_BRAND_RADIUS,
} from '../../theme/authLayout';
import { APP_FONT_FAMILY } from '../../theme/typography';

const logoLight = require('../../../assets/brand/app/ios-light.png');
const logoDark = require('../../../assets/brand/app/ios-dark.png');

type LoginScreenSurfaceProps = {
  vm: LoginScreenViewModel;
};

export function LoginScreenSurface({ vm }: LoginScreenSurfaceProps) {
  const { colors, isDark, statusBarStyle } = useAppTheme();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputType>(null);
  const logo = isDark ? logoDark : logoLight;

  const c = colors;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior="padding">
      <StatusBar style={statusBarStyle} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* ── Brand ── */}
        <View style={styles.brand}>
          <View style={[styles.iconFrame, { backgroundColor: c.secondarySystemBackground, borderColor: c.separator }]}>
            <Image
              key={isDark ? 'dark' : 'light'}
              source={logo}
              style={styles.icon}
              contentFit="contain"
              accessibilityLabel="NiX"
            />
          </View>
          <Text style={[styles.tagline, { color: c.textSecondary }]}>
            {vm.t('auth.tagline')}
          </Text>
        </View>

        {/* ── Form card ── */}
        <View style={[styles.card, { backgroundColor: c.tertiarySystemBackground, borderColor: c.separator }]}>

          {/* Email */}
          <TextInput
            style={[styles.input, { color: c.textPrimary, borderBottomColor: c.separator }]}
            placeholder={vm.t('auth.emailPlaceholder')}
            placeholderTextColor={c.textMuted}
            value={vm.email}
            onChangeText={(text) => {
              vm.onEmailChange(text);
              vm.clearError();
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!vm.authBusy}
          />

          {/* Password */}
          <TextInput
            ref={passwordRef}
            style={[styles.input, styles.inputLast, { color: c.textPrimary }]}
            placeholder={vm.t('auth.passwordPlaceholder')}
            placeholderTextColor={c.textMuted}
            value={vm.password}
            onChangeText={(text) => {
              vm.onPasswordChange(text);
              vm.clearError();
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={() => void vm.handleSignIn()}
            editable={!vm.authBusy}
          />
        </View>

        {/* ── Forgot password ── */}
        <Pressable
          onPress={vm.goToForgotPassword}
          style={({ pressed }) => [styles.textLink, { opacity: pressed ? 0.5 : 1 }]}
          disabled={vm.authBusy}>
          <Text style={[styles.textLinkLabel, { color: c.accent }]}>
            {vm.t('auth.forgotPassword')}
          </Text>
        </Pressable>

        {/* ── Error ── */}
        {vm.error ? (
          <Text style={[styles.errorText, { color: c.error }]}>
            {vm.error}
          </Text>
        ) : null}

        {/* ── Login button ── */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: c.accent,
              opacity: vm.authBusy ? 0.6 : pressed ? 0.82 : 1,
            },
          ]}
          onPress={() => void vm.handleSignIn()}
          disabled={vm.authBusy}
          accessibilityRole="button">
          {vm.loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.primaryButtonLabel, { color: '#fff' }]}>
              {vm.t('auth.loginButton')}
            </Text>
          )}
        </Pressable>

        {/* ── Register link ── */}
        <Pressable
          onPress={vm.goToRegister}
          style={({ pressed }) => [styles.textLink, { opacity: pressed ? 0.5 : 1 }]}
          disabled={vm.authBusy}>
          <Text style={[styles.textLinkLabel, { color: c.accent }]}>
            {vm.t('auth.noAccountPrompt')}{' '}
            <Text style={styles.textLinkBold}>{vm.t('auth.noAccountLink')}</Text>
          </Text>
        </Pressable>

        {/* ── Divider + Social ── */}
        {vm.showSocialDivider || true ? (
          <View style={styles.socialSection}>
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: c.separator }]} />
              <Text style={[styles.dividerLabel, { color: c.textMuted }]}>
                {vm.t('auth.orContinueWith')}
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: c.separator }]} />
            </View>

            {vm.showSocialDivider ? (
              <AuthAppleSignInButton
                width={vm.contentWidth}
                disabled={vm.authBusy}
                onPress={() => void vm.handleSocialSignIn('apple')}
              />
            ) : null}

            <View style={vm.showSocialDivider ? styles.googleGap : undefined}>
              <AuthGoogleSignInButton
                width={vm.contentWidth}
                disabled={vm.authBusy}
                onPress={() => void vm.handleSocialSignIn('google')}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const INPUT_HEIGHT = 52;
const BUTTON_HEIGHT = 52;
const BORDER_RADIUS = 14;
const H_PAD = 20;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: H_PAD,
    gap: 12,
    alignItems: 'center',
  },

  // Brand
  brand: {
    alignItems: 'center',
    paddingVertical: 8,
    width: '100%',
  },
  iconFrame: {
    width: AUTH_BRAND_FRAME_SIZE,
    height: AUTH_BRAND_FRAME_SIZE,
    borderRadius: AUTH_BRAND_RADIUS,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  icon: {
    width: AUTH_BRAND_ICON_SIZE,
    height: AUTH_BRAND_ICON_SIZE,
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    maxWidth: 300,
  },

  // Form card
  card: {
    width: '100%',
    borderRadius: BORDER_RADIUS,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  input: {
    height: INPUT_HEIGHT,
    paddingHorizontal: 16,
    fontSize: 17,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '400',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputLast: {
    borderBottomWidth: 0,
  },

  // Links
  textLink: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  textLinkLabel: {
    fontSize: 15,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '400',
    textAlign: 'center',
  },
  textLinkBold: {
    fontWeight: '600',
  },

  // Error
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  // Primary button
  primaryButton: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderRadius: BORDER_RADIUS,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontSize: 17,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Social
  socialSection: {
    width: '100%',
    gap: 12,
    marginTop: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontSize: 13,
    fontFamily: APP_FONT_FAMILY,
    fontWeight: '500',
    textTransform: 'lowercase',
  },
  googleGap: {
    marginTop: 0,
  },
});
