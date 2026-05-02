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
import { useAuth } from '../../hooks/useAuth';
import { useAppTheme } from '../../hooks/useAppTheme';
import type { ThemeColors } from '../../theme/colors';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { NativeButton } from '../../components/ui/native-button';
import { NativeInput } from '../../components/ui/native-input';
import { Host, Text as SUIText, VStack, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';

const GAP_MD = 16;
const GAP_SM = 12;

/** Większy znak marki w okręgu (bez SwiftUI Circle — tam `background` bywało renderowane jak czarna plama). */
const LOGO_MARK_SIZE = 204;
const LOGO_TEXT_SIZE = 64;
/** Promień karty jak ustaliliście dla stylu iOS. */
const CARD_RADIUS = 26;

function getAuthErrorMessage(message: string) {
  if (message.includes('Invalid login credentials')) return 'Nieprawidłowy e-mail lub hasło.';
  if (message.includes('Email not confirmed')) return 'Najpierw potwierdź e-mail. Sprawdź skrzynkę.';
  return message;
}

/** Hero: okrąg z RN (poprawne tło/obrys), tekst NiX + reszta w SwiftUI z `design: 'rounded'` i kolorami z tokenów (hex). */
function LoginHeroIos({
  colors,
  isDark,
  contentWidth,
}: {
  colors: ThemeColors;
  isDark: boolean;
  contentWidth: number;
}) {
  const scheme = isDark ? 'dark' : 'light';
  const inset = StyleSheet.hairlineWidth;

  return (
    <View style={[styles.heroIosWrap, { width: contentWidth }]}>
      <View
        style={[
          styles.logoMarkIos,
          {
            width: LOGO_MARK_SIZE,
            height: LOGO_MARK_SIZE,
            borderRadius: LOGO_MARK_SIZE / 2,
            backgroundColor: colors.surface,
            borderColor: isDark ? colors.borderStrong : PlatformColor('separator'),
            borderWidth: inset,
          },
        ]}>
        <Host
          matchContents
          ignoreSafeArea="all"
          style={styles.logoHostSwift}
          colorScheme={scheme}>
          <VStack alignment="center" modifiers={[frame({ width: LOGO_MARK_SIZE, height: LOGO_MARK_SIZE })]}>
            <Spacer />
            <SUIText
              modifiers={[
                font({ size: LOGO_TEXT_SIZE, weight: 'bold', design: 'rounded' }),
                foregroundStyle(colors.textPrimary),
              ]}>
              NiX
            </SUIText>
            <Spacer />
          </VStack>
        </Host>
      </View>

      <Host
        matchContents
        ignoreSafeArea="all"
        style={styles.heroTextHostSwift}
        colorScheme={scheme}>
        <VStack spacing={14} alignment="center" modifiers={[frame({ width: contentWidth })]}>
          <SUIText
            modifiers={[
              font({ size: 15, weight: 'regular', design: 'rounded' }),
              foregroundStyle(colors.textMuted),
              multilineTextAlignment('center'),
              frame({ maxWidth: contentWidth - GAP_MD * 2 }),
            ]}>
            Ultraprywatne wiadomości wizualne
          </SUIText>
          <SUIText
            modifiers={[
              font({ size: 22, weight: 'semibold', design: 'rounded' }),
              foregroundStyle(colors.textPrimary),
            ]}>
            Zaloguj się
          </SUIText>
        </VStack>
      </Host>
    </View>
  );
}

export default function LoginScreen() {
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
      setError('Podaj adres e-mail.');
      return;
    }
    if (!password.trim()) {
      setError('Podaj hasło.');
      return;
    }

    setLoading(true);
    setError(null);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);

    if (error) {
      setError(getAuthErrorMessage(error.message));
    }
  };

  const cardBorderColor =
    isIos ? PlatformColor('separator') : colors.borderStrong;

  /** Szerokość kolumny treści (marginesy już w `paddingHorizontal` ScrollView). */
  const contentWidth = Math.max(260, windowWidth - GAP_MD * 2);

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
          {isIos ? (
            <LoginHeroIos colors={colors} isDark={isDark} contentWidth={contentWidth} />
          ) : (
            <View style={styles.heroAndroid}>
              <View
                style={[
                  styles.logoMark,
                  {
                    backgroundColor: colors.surface,
                    borderColor: cardBorderColor,
                  },
                ]}>
                <Text style={[styles.heroLogoAndroid, { color: colors.textPrimary }]}>NiX</Text>
              </View>
              <Text style={[styles.heroTaglineAndroid, { color: colors.textMuted }]}>
                Ultraprywatne wiadomości wizualne
              </Text>
              <Text style={[styles.heroTitleAndroid, { color: colors.textPrimary }]}>
                Zaloguj się
              </Text>
            </View>
          )}

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: cardBorderColor,
                ...(isDark ? {} : { boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)' }),
              },
            ]}>
            <View style={{ gap: GAP_SM }}>
              <NativeInput
                placeholder="twój@email.com"
                value={email}
                onChangeText={(value) => {
                  setError(null);
                  setEmail(value);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
              />
              <NativeInput
                placeholder="Wpisz hasło"
                value={password}
                onChangeText={(value) => {
                  setError(null);
                  setPassword(value);
                }}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={handleSignIn}
              />
            </View>

            {error ? (
              <Text selectable style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            ) : null}

            <NativeButton
              label={loading ? 'Logowanie…' : 'Zaloguj'}
              onPress={handleSignIn}
              loading={loading}
              disabled={loading}
            />

            <View style={styles.links}>
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text style={[styles.linkLabel, { color: colors.accent }]}>Nie pamiętam hasła</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={8}>
                <Text style={[styles.linkLabel, { color: colors.accent }]}>
                  Nie masz konta? Zarejestruj się
                </Text>
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
  heroAndroid: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: GAP_MD,
  },
  logoMark: {
    width: LOGO_MARK_SIZE,
    height: LOGO_MARK_SIZE,
    borderRadius: LOGO_MARK_SIZE / 2,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLogoAndroid: {
    fontSize: 62,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    letterSpacing: -2,
    textAlign: 'center',
  },
  heroTaglineAndroid: {
    fontSize: 15,
    fontWeight: '400',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: GAP_MD,
  },
  heroTitleAndroid: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
    marginTop: 2,
    textAlign: 'center',
  },
  heroIosWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 14,
    paddingVertical: GAP_MD,
    backgroundColor: 'transparent',
  },
  logoMarkIos: {
    borderCurve: 'continuous',
    overflow: 'visible',
    position: 'relative',
  },
  logoHostSwift: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  heroTextHostSwift: {
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
