import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useAppTheme } from '../../hooks/useAppTheme';

const SOCIAL_BUTTON_HEIGHT = 48;

type SocialButtonProps = {
  width: number;
  disabled?: boolean;
  onPress: () => void;
};

export function AuthGoogleSignInButton({ width, disabled, onPress }: SocialButtonProps) {
  const { isDark } = useAppTheme();

  return (
    <GoogleSigninButton
      size={GoogleSigninButton.Size.Wide}
      color={isDark ? GoogleSigninButton.Color.Dark : GoogleSigninButton.Color.Light}
      onPress={onPress}
      disabled={disabled}
      style={{ width, height: SOCIAL_BUTTON_HEIGHT }}
      accessibilityLabel="Sign in with Google"
    />
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
      pointerEvents={disabled ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={styles.appleButton}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  appleWrap: {
    height: SOCIAL_BUTTON_HEIGHT,
  },
  appleButton: {
    width: '100%',
    height: SOCIAL_BUTTON_HEIGHT,
  },
});
