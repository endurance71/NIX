import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AUTH_SOCIAL_BUTTON_HEIGHT } from '../../theme/authLayout';
import { authRnTextStyle } from '../../theme/authTypography';

type SocialButtonProps = {
  width: number;
  disabled?: boolean;
  onPress: () => void;
};

function GoogleIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
}

export function AuthGoogleSignInButton({ width, disabled, onPress }: SocialButtonProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.googleButton,
        {
          width,
          backgroundColor: colors.secondarySystemBackground,
          borderColor: colors.separator,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
      accessibilityLabel={t('auth.signInWithGoogle')}
      accessibilityRole="button"
    >
      <View style={styles.googleContent}>
        <GoogleIcon size={22} />
        <Text style={[styles.googleText, authRnTextStyle('socialButton', colors)]}>
          {t('auth.signInWithGoogle')}
        </Text>
      </View>
    </Pressable>
  );
}

export function AuthAppleSignInButton({ width, disabled, onPress }: SocialButtonProps) {
  const { isDark } = useAppTheme();
  const [available, setAvailable] = useState(process.env.EXPO_OS === 'ios');

  useEffect(() => {
    if (process.env.EXPO_OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  if (!available) return null;

  return (
    <View
      style={[styles.appleWrap, { width, opacity: disabled ? 0.45 : 1 }]}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
        }
        cornerRadius={14}
        style={styles.appleButton}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    height: AUTH_SOCIAL_BUTTON_HEIGHT,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  googleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleText: {},
  appleWrap: {
    height: AUTH_SOCIAL_BUTTON_HEIGHT,
  },
  appleButton: {
    width: '100%',
    height: AUTH_SOCIAL_BUTTON_HEIGHT,
  },
});
