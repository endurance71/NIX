import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { tap } from '../../lib/haptics';
import { typography } from '../../theme/typography';

type Variant = 'primary' | 'secondary' | 'destructive';

type NativeButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
};

export function NativeButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: NativeButtonProps) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;

  const variantStyle =
    variant === 'primary'
      ? {
          backgroundColor: colors.buttonPrimaryBg,
          borderColor: colors.buttonPrimaryBg,
          textColor: colors.buttonPrimaryText,
        }
      : variant === 'destructive'
        ? {
            backgroundColor: 'transparent',
            borderColor: colors.destructive,
            textColor: colors.destructive,
          }
        : {
            backgroundColor: colors.surface,
            borderColor: colors.separator,
            textColor: colors.label,
          };

  const handlePress = () => {
    if (isDisabled) return;
    tap(variant === 'destructive' ? 'heavy' : 'light');
    onPress();
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
        },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.textColor} />
      ) : (
        <Text style={[styles.label, { color: variantStyle.textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  label: {
    ...typography.callout,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
});
