import { StyleSheet, View } from 'react-native';
import {
  AuthAppleSignInButton,
  AuthGoogleSignInButton,
} from '../ui/auth-social-sign-in-buttons';
import { AuthFormDivider } from '../ui/auth-form-layout';

type AuthSocialBlockProps = {
  dividerLabel: string;
  contentWidth: number;
  disabled?: boolean;
  showDivider?: boolean;
  onApplePress: () => void;
  onGooglePress: () => void;
};

export function AuthSocialBlock({
  dividerLabel,
  contentWidth,
  disabled,
  showDivider = true,
  onApplePress,
  onGooglePress,
}: AuthSocialBlockProps) {
  const showApple = process.env.EXPO_OS === 'ios';

  return (
    <View style={styles.socialBlock}>
      {showDivider ? <AuthFormDivider label={dividerLabel} /> : null}
      {showApple ? (
        <View style={styles.appleSlot}>
          <AuthAppleSignInButton
            width={contentWidth}
            disabled={disabled}
            onPress={onApplePress}
          />
        </View>
      ) : null}
      <AuthGoogleSignInButton
        width={contentWidth}
        disabled={disabled}
        onPress={onGooglePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  socialBlock: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 8,
    paddingBottom: 8,
  },
  appleSlot: {
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
});
