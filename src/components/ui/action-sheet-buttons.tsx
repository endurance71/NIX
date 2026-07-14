import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

type ActionSheetPrimaryButtonProps = {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

type ActionSheetSecondaryButtonProps = {
  label?: string;
  disabled?: boolean;
  onPress: () => void;
};

export function ActionSheetPrimaryButton({
  label,
  loading = false,
  disabled = false,
  destructive = false,
  onPress,
}: ActionSheetPrimaryButtonProps) {
  const { colors } = useAppTheme();
  const styles = createButtonStyles(colors);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: destructive ? colors.error : colors.buttonPrimaryBg },
        pressed && styles.pressed,
        isDisabled && styles.primaryDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={destructive ? '#FFFFFF' : colors.buttonPrimaryText} />
      ) : (
        <Text style={[styles.primaryLabel, { color: destructive ? '#FFFFFF' : colors.buttonPrimaryText }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function ActionSheetSecondaryButton({
  label = 'Anuluj',
  disabled = false,
  onPress,
}: ActionSheetSecondaryButtonProps) {
  const { colors } = useAppTheme();
  const styles = createButtonStyles(colors);

  return (
    <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.cancelLabel, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const createButtonStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    primaryButton: {
      alignSelf: 'stretch',
      width: '100%',
      borderRadius: 16,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginTop: 4,
    },
    primaryLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      fontFamily: APP_FONT_FAMILY,
    },
    primaryDisabled: {
      opacity: 0.85,
    },
    cancelButton: {
      minHeight: 34,
      paddingVertical: 4,
      marginBottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '500',
      fontFamily: APP_FONT_FAMILY,
    },
    pressed: {
      opacity: 0.65,
    },
  });
