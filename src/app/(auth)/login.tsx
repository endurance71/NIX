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
import { Column, Host, Spacer, Text as UiText, TextInput, Button } from '@expo/ui';
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ThemeColors } from '../../theme/colors';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { notifyError } from '../../lib/appNotify';
import { useTranslation } from 'react-i18next';

const GAP_MD = 16;
const GAP_SM = 12;
const LOGO_MARK_SIZE = 204;
const LOGO_TEXT_SIZE = 64;
const CARD_RADIUS = 26;

function getAuthErrorMessage(message: string, t: (key: string) => string) {
  if (message.includes('Invalid login credentials')) return t('auth.invalidCredentials');
  if (message.includes('Email not confirmed')) return t('auth.emailNotConfirmed');
  return message;
}

function LoginHero({
  colors,
  isDark,
  contentWidth,
  t,
}: {
  colors: ThemeColors;
  isDark: boolean;
  contentWidth: number;
  t: (key: string) => string;
}) {
  const scheme = isDark ? 'dark' : 'light';

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
            borderColor: isDark ? colors.borderStrong : PlatformColor('separator'),
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}>
        <Host matchContents ignoreSafeArea="all" style={styles.logoHost} colorScheme={scheme}>
          <Column style={{ width: LOGO_MARK_SIZE, height: LOGO_MARK_SIZE }} alignment="center">
            <UiText textStyle={{ fontSize: LOGO_TEXT_SIZE, fontWeight: '700', color: colors.textPrimary }}>NiX</UiText>
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
          <UiText textStyle={{ fontSize: 22, fontWeight: '600', color: colors.textPrimary }}>
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
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();

  const isIos = process.env.EXPO_OS === 'ios';

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

  const cardBorderColor = isIos ? PlatformColor('separator') : colors.borderStrong;
  const contentWidth = Math.max(260, windowWidth - GAP_MD * 2);
  const scheme = isDark ? 'dark' : 'light';

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
          <LoginHero colors={colors} isDark={isDark} contentWidth={contentWidth} t={t} />

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorderColor,
                ...(isDark ? {} : { boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)' }),
              },
            ]}>
            <Host matchContents colorScheme={scheme} style={{ width: '100%' }}>
              <TextInput
                placeholder={t('auth.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setError(null);
                  setEmail(value);
                }}
              />
              <TextInput
                placeholder={t('auth.passwordPlaceholder')}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => {
                  setError(null);
                  setPassword(value);
                }}
              />
              <Spacer />
              {error ? (
                <Text selectable style={[styles.errorText, { color: colors.error }]}>
                  {error}
                </Text>
              ) : null}
              <Button
                label={loading ? t('auth.loginLoading') : t('auth.loginButton')}
                onPress={loading ? undefined : handleSignIn}
                variant="filled"
              />
            </Host>

            <View style={styles.links}>
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text style={[styles.linkLabel, { color: colors.accent }]}>{t('auth.forgotPassword')}</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={8}>
                <Text style={[styles.linkLabel, { color: colors.accent }]}>{t('auth.noAccount')}</Text>
              </Pressable>
            </View>
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
    padding: GAP_MD + 2,
    gap: GAP_MD,
  },
  errorText: {
    fontSize: 13,
    fontFamily: APP_FONT_FAMILY,
    lineHeight: 18,
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
