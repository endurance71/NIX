import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AvatarCircle } from './avatar-circle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

type ConfirmationSheetProps = {
  title: string;
  message: string;
  avatarUrl?: string | null;
  avatarStoragePath?: string | null;
  avatarEmoji?: string | null;
  fallbackInitial?: string | null;
  primaryActionLabel: string;
  primaryActionLoadingLabel: string;
  onConfirm: () => Promise<void>;
};

export function ConfirmationSheet({
  title,
  message,
  avatarUrl,
  avatarStoragePath,
  avatarEmoji,
  fallbackInitial,
  primaryActionLabel,
  primaryActionLoadingLabel,
  onConfirm,
}: ConfirmationSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } catch (err) {
      console.error('Confirmation action failed', err);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

      <View style={styles.avatarContainer}>
        <AvatarCircle
          size={118}
          url={avatarUrl}
          storagePath={avatarStoragePath}
          emoji={avatarEmoji}
          fallbackInitial={fallbackInitial}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.error }, pressed && styles.pressed]}
        onPress={handleConfirm}
        disabled={loading}
      >
        <Text style={styles.primaryLabel}>{loading ? primaryActionLoadingLabel : primaryActionLabel}</Text>
      </Pressable>

      <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]} onPress={() => router.back()} disabled={loading}>
        <Text style={[styles.cancelLabel, { color: colors.accent }]}>Anuluj</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: '96%',
      alignSelf: 'center',
      paddingHorizontal: 22,
      paddingTop: 12,
      paddingBottom: 16,
      backgroundColor: 'transparent',
      borderRadius: 34,
      gap: 14,
    },
    title: {
      fontSize: 24,
      lineHeight: 30,
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
    avatarContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      marginBottom: 6,
    },
    primaryButton: {
      borderRadius: 16,
      paddingVertical: 13,
      alignItems: 'center',
    },
    primaryLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      color: '#FFFFFF',
      fontFamily: APP_FONT_FAMILY,
    },
    cancelButton: {
      paddingVertical: 8,
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
