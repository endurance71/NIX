import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { RNHostView, VStack } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import {
  AUTH_PRIMARY_BUTTON_HEIGHT,
  AUTH_PRIMARY_BUTTON_RADIUS,
  getAuthPrimaryButtonWidth,
} from '../../theme/authLayout';
import { useAuthContentWidth } from './auth-content-width';

type AuthPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/** Full-width primary CTA hosted in RN for reliable width and corner radius on iOS. */
export function AuthPrimaryButton({
  label,
  onPress,
  disabled,
  loading = false,
}: AuthPrimaryButtonProps) {
  const { colors } = useAppTheme();
  const contentWidth = useAuthContentWidth();
  const buttonWidth = getAuthPrimaryButtonWidth(contentWidth, loading);
  const isDisabled = disabled || loading;

  return (
    <VStack alignment="center" spacing={0} modifiers={[frame({ width: contentWidth, alignment: 'leading' })]}>
      <RNHostView matchContents>
        <View style={[styles.wrap, { width: buttonWidth }, isDisabled && styles.disabled]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: isDisabled, busy: loading }}
            disabled={isDisabled}
            onPress={onPress}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.systemBlue },
              pressed && !isDisabled ? styles.pressed : null,
            ]}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.label, styles.labelOnBlue]}>{label}</Text>
            )}
          </Pressable>
        </View>
      </RNHostView>
    </VStack>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: AUTH_PRIMARY_BUTTON_HEIGHT,
    borderRadius: AUTH_PRIMARY_BUTTON_RADIUS,
    overflow: 'hidden',
  },
  button: {
    width: '100%',
    height: AUTH_PRIMARY_BUTTON_HEIGHT,
    borderRadius: AUTH_PRIMARY_BUTTON_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  labelOnBlue: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.45,
  },
});
