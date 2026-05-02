import { useMemo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SFSymbol } from '../components/ui/sf-symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PreviewScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { uri, viewDurationSec } = useLocalSearchParams<{ uri: string; viewDurationSec?: string }>();

  if (!uri) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Nie przechwycono zdjęcia</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Wróć</Text>
        </Pressable>
      </View>
    );
  }

  const handleDiscard = () => {
    router.back();
  };

  const handleSendTo = () => {
    router.push({
      pathname: '/send-to',
      params: { uri, ...(viewDurationSec ? { viewDurationSec } : {}) },
    });
  };

  return (
    <Animated.View 
      style={styles.container} 
      entering={FadeIn.duration(200)} 
      exiting={FadeOut.duration(200)}
    >
      <StatusBar style={statusBarStyle} hidden />
      
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="none"
      />

      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }]}>
        <View style={styles.topControls}>
          <Pressable
            accessibilityLabel="Odrzuć zdjęcie"
            accessibilityRole="button"
            onPress={handleDiscard}
            style={styles.iconButton}>
            <SFSymbol name="xmark" size={22} tintColor={colors.cameraControlTint} />
          </Pressable>
        </View>

        <View style={styles.bottomControls}>
          <Pressable 
            accessibilityLabel="Wybierz odbiorców zdjęcia"
            accessibilityRole="button"
            onPress={handleSendTo} 
            style={({ pressed }) => [
              styles.sendButton,
              pressed && styles.sendButtonPressed
            ]}
          >
            <Text style={styles.sendButtonText}>Wyślij do</Text>
            <SFSymbol name="chevron.right" size={16} tintColor={colors.buttonPrimaryText} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorText: {
    ...typography.callout,
    color: colors.label,
    textAlign: 'center',
    marginTop: 100,
  },
  backButton: {
    marginTop: 20,
    alignSelf: 'center',
    padding: 12,
    backgroundColor: colors.secondarySystemBackground,
    borderRadius: 8,
  },
  backButtonText: {
    ...typography.footnote,
    color: colors.label,
    fontWeight: '600',
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cameraControlBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.buttonPrimaryBg,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 4,
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendButtonText: {
    ...typography.callout,
    color: colors.buttonPrimaryText,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  });
