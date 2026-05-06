import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { APP_FONT_FAMILY } from '../theme/typography';
import { SHEET_CONTENT_PADDING_TOP } from '../theme/sheetLayout';

export default function FriendScanQrSheet() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Skanuj kod znajomego</Text>
      <Text style={styles.message}>Ustaw kod QR profilu w ramce, a potem potwierdź dodanie w arkuszu.</Text>

      <View style={styles.row}>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => router.back()}>
          <Text style={styles.secondaryLabel}>Skanuj ponownie</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => router.dismissAll()}>
          <Text style={styles.primaryLabel}>Wróć</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: '96%',
      alignSelf: 'center',
      alignItems: 'stretch',
      paddingHorizontal: 22,
      paddingTop: SHEET_CONTENT_PADDING_TOP,
      paddingBottom: 16,
      backgroundColor: 'transparent',
      borderRadius: 34,
      gap: 14,
    },
    title: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color: colors.textPrimary,
      fontFamily: APP_FONT_FAMILY,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    message: {
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      color: colors.textSecondary,
      fontFamily: APP_FONT_FAMILY,
      marginBottom: 2,
    },
    row: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    secondaryButton: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      backgroundColor: colors.surface,
    },
    secondaryLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      color: colors.textPrimary,
      fontFamily: APP_FONT_FAMILY,
    },
    primaryButton: {
      flex: 1,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      backgroundColor: colors.buttonPrimaryBg,
    },
    primaryLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      color: colors.buttonPrimaryText,
      fontFamily: APP_FONT_FAMILY,
    },
    pressed: {
      opacity: 0.65,
    },
  });
