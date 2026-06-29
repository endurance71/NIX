import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { APP_FONT_FAMILY } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

export const ACTION_SHEET_AVATAR_SIZE = 96;

type ActionSheetSurfaceProps = {
  title: string;
  message?: string;
  contentAlign?: 'center' | 'stretch';
  children?: ReactNode;
  actions?: ReactNode;
};

type ActionSheetPrimaryButtonProps = {
  label: string;
  loadingLabel?: string;
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

export function ActionSheetSurface({ title, message, contentAlign = 'center', children, actions }: ActionSheetSurfaceProps) {
  const { colors } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const styles = createStyles(colors, topContentInset, bottomContentInset);

  return (
    <View style={styles.screenRoot}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
        {children ? (
          <View style={[styles.content, contentAlign === 'stretch' ? styles.contentStretch : styles.contentCenter]}>
            {children}
          </View>
        ) : null}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );
}

export function ActionSheetPrimaryButton({
  label,
  loadingLabel,
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
          {loadingLabel ?? label}
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

const createStyles = (_colors: ThemeColors, paddingTop: number, paddingBottom: number) =>
  StyleSheet.create({
    screenRoot: {
      alignSelf: 'stretch',
      flexGrow: 0,
      backgroundColor: 'transparent',
    },
    container: {
      width: '96%',
      alignSelf: 'center',
      paddingHorizontal: 22,
      paddingTop,
      paddingBottom: Math.max(paddingBottom, 14),
      backgroundColor: 'transparent',
      gap: 12,
    },
    title: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      textAlign: 'center',
      fontFamily: APP_FONT_FAMILY,
      paddingHorizontal: 12,
    },
    message: {
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginBottom: 2,
      fontFamily: APP_FONT_FAMILY,
    },
    content: {
      gap: 12,
    },
    contentCenter: {
      alignItems: 'center',
    },
    contentStretch: {
      alignItems: 'stretch',
    },
    actions: {
      gap: 12,
    },
  });

const createButtonStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    primaryButton: {
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
      paddingTop: 4,
      paddingBottom: 0,
      marginBottom: 0,
      alignItems: 'center',
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
