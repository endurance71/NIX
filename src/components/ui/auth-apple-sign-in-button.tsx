import { StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { RNHostView, VStack } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AUTH_SOCIAL_BUTTON_HEIGHT, AUTH_SOCIAL_BUTTON_RADIUS } from '../../theme/authLayout';
import { useAuthContentWidth } from './auth-content-width';

type AuthAppleSignInButtonProps = {
  disabled?: boolean;
  onPress: () => void;
};

/** Official Apple Sign In control sized to match auth content width. */
export function AuthAppleSignInButton({ disabled, onPress }: AuthAppleSignInButtonProps) {
  const { isDark } = useAppTheme();
  const contentWidth = useAuthContentWidth();

  return (
    <VStack alignment="center" spacing={0} modifiers={[frame({ width: contentWidth, alignment: 'center' })]}>
      <RNHostView matchContents>
        <View
          style={[styles.providerWrap, { width: contentWidth }, disabled && styles.disabled]}
          pointerEvents={disabled ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              isDark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={AUTH_SOCIAL_BUTTON_RADIUS}
            style={styles.providerButton}
            onPress={onPress}
          />
        </View>
      </RNHostView>
    </VStack>
  );
}

const styles = StyleSheet.create({
  providerWrap: {
    height: AUTH_SOCIAL_BUTTON_HEIGHT,
    borderRadius: AUTH_SOCIAL_BUTTON_RADIUS,
    overflow: 'hidden',
  },
  providerButton: {
    width: '100%',
    height: AUTH_SOCIAL_BUTTON_HEIGHT,
  },
  disabled: {
    opacity: 0.45,
  },
});
