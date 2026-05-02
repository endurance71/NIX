import { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { SFSymbol } from '../../components/ui/sf-symbol';
import {
  SNAP_VIEW_DURATION_CHOICES,
  formatSnapViewDurationLabel,
  loadPreferredSnapViewDuration,
  savePreferredSnapViewDuration,
  shortSnapViewDurationLabel,
  type SnapViewDurationSec,
} from '../../lib/snapViewDuration';
import { Host, ConfirmationDialog, Button, Text as SUIText, RNHostView } from '@expo/ui/swift-ui';

export default function CameraScreen() {
  const { colors, statusBarStyle } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [permissionLoadingTimedOut, setPermissionLoadingTimedOut] = useState(false);
  const [viewDurationSec, setViewDurationSec] = useState<SnapViewDurationSec>(5);
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const [takingPicture, setTakingPicture] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  
  const shutterScale = useSharedValue(1);
  const flashOpacity = useSharedValue(0);

  // ALL HOOKS MUST BE DECLARED BEFORE EARLY RETURNS
  const animatedShutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  const animatedFlashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  useEffect(() => {
    if (permission) {
      setPermissionLoadingTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setPermissionLoadingTimedOut(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [permission]);

  useEffect(() => {
    let cancelled = false;
    void loadPreferredSnapViewDuration().then((sec) => {
      if (!cancelled) setViewDurationSec(sec);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Inicjalizacja kamery...</Text>
        {permissionLoadingTimedOut && (
          <>
            <Text style={styles.permissionHint}>
              Kamera nie odpowiedziała. Spróbuj ponownie albo przejdź do Skrzynki.
            </Text>
            <Pressable style={styles.permissionButton} onPress={() => router.replace('/(tabs)/inbox')}>
              <Text style={styles.permissionButtonText}>Przejdź do Skrzynki</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>NiX potrzebuje dostępu do kamery, aby uchwycić momenty.</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Udziel dostępu</Text>
        </Pressable>
      </View>
    );
  }

  const toggleFacing = () => {
    setFacing(prev => prev === 'back' ? 'front' : 'back');
  };

  const toggleFlash = () => {
    setFlash(prev => prev === 'off' ? 'on' : 'off');
  };

  const takePicture = async () => {
    if (takingPicture) return;
    setTakingPicture(true);
    setCaptureError(null);
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Native ease animation for shutter button (144fps via UI thread)
    shutterScale.value = withSequence(
      withTiming(0.85, { duration: 100, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 100, easing: Easing.out(Easing.ease) })
    );

    // Screen flash animation (black overlay for stealth/speed feel)
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 50 }),
      withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) })
    );

    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          // Na iOS skipProcessing potrafi zwrócić niepełny/0B plik.
          skipProcessing: false
        });
        
        if (photo) {
          router.push({
            pathname: '/preview',
            params: { uri: photo.uri, viewDurationSec: String(viewDurationSec) },
          });
        }
      } catch (err) {
        console.error('Nie udało się zrobić zdjęcia', err);
        setCaptureError('Nie udało się zrobić zdjęcia. Spróbuj ponownie.');
      } finally {
        setTakingPicture(false);
      }
    } else {
      setCaptureError('Kamera nie jest jeszcze gotowa.');
      setTakingPicture(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} hidden />
      <CameraView 
        style={styles.camera} 
        facing={facing}
        enableTorch={flash === 'on'}
        ref={cameraRef}
      />
      <View style={styles.cameraOverlay}>
        <Animated.View style={[styles.flashOverlay, animatedFlashStyle]} pointerEvents="none" />
        
        <View style={[styles.controlsContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 }]}>
          <View style={styles.topControls}>
            <Pressable onPress={toggleFlash} style={styles.iconButton} accessibilityLabel={flash === 'on' ? 'Wyłącz latarkę' : 'Włącz latarkę'} hitSlop={15}>
              <SFSymbol
                name={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'}
                size={22}
                tintColor={colors.cameraControlTint}
              />
            </Pressable>
            <Host matchContents>
              <ConfirmationDialog
                title="Czas wyświetlania"
                isPresented={durationPickerOpen}
                onIsPresentedChange={setDurationPickerOpen}
              >
                <ConfirmationDialog.Trigger>
                  <RNHostView matchContents>
                    <Pressable style={styles.timerButton} onPress={() => setDurationPickerOpen(true)} hitSlop={10}>
                      <SFSymbol name="timer" size={20} tintColor={colors.cameraControlTint} />
                      <Text style={styles.timerButtonLabel}>{shortSnapViewDurationLabel(viewDurationSec)}</Text>
                    </Pressable>
                  </RNHostView>
                </ConfirmationDialog.Trigger>
                <ConfirmationDialog.Message>
                  <SUIText>Jak długo zdjęcie będzie widoczne u odbiorcy po otwarciu.</SUIText>
                </ConfirmationDialog.Message>
                <ConfirmationDialog.Actions>
                  {SNAP_VIEW_DURATION_CHOICES.map((sec) => (
                    <Button
                      key={sec}
                      label={formatSnapViewDurationLabel(sec)}
                      {...(sec === viewDurationSec ? { systemImage: 'checkmark.circle.fill' as const } : {})}
                      onPress={() => {
                        setViewDurationSec(sec);
                        void savePreferredSnapViewDuration(sec);
                        setDurationPickerOpen(false);
                      }}
                    />
                  ))}
                  <Button role="cancel" label="Anuluj" onPress={() => setDurationPickerOpen(false)} />
                </ConfirmationDialog.Actions>
              </ConfirmationDialog>
            </Host>
          </View>

          <View style={styles.bottomControls}>
            <View style={styles.sideButtonContainer}>
               {/* Left placeholder for symmetry */}
            </View>

            <View style={styles.shutterStack}>
              {captureError ? <Text style={styles.captureError}>{captureError}</Text> : null}
              <Pressable
                onPress={takePicture}
                accessibilityLabel="Zrób zdjęcie"
                accessibilityRole="button"
                accessibilityState={{ disabled: takingPicture }}
                disabled={takingPicture}
                hitSlop={15}>
              <Animated.View style={[styles.shutterOuter, takingPicture && styles.shutterDisabled, animatedShutterStyle]}>
                <View style={styles.shutterInner} />
              </Animated.View>
            </Pressable>
            </View>

            <View style={styles.sideButtonContainer}>
              <Pressable onPress={toggleFacing} style={styles.iconButton} accessibilityLabel="Zmień kamerę" hitSlop={15}>
                <SFSymbol name="camera.rotate.fill" size={22} tintColor={colors.cameraControlTint} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionText: {
    color: colors.textPrimary,
    ...typography.callout,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  permissionHint: {
    color: colors.textSecondary,
    ...typography.footnote,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: colors.buttonPrimaryBg,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  permissionButtonText: {
    color: colors.buttonPrimaryText,
    ...typography.callout,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
  },
  controlsContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: colors.cameraControlBackground,
  },
  timerButtonLabel: {
    color: colors.cameraControlTint,
    ...typography.footnote,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  sideButtonContainer: {
    width: 60,
    alignItems: 'center',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.cameraControlBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterStack: {
    alignItems: 'center',
    gap: 10,
  },
  captureError: {
    ...typography.footnote,
    maxWidth: 220,
    color: colors.cameraControlTint,
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.cameraControlBackground,
    overflow: 'hidden',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.cameraControlTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.cameraControlTint,
  },
  shutterDisabled: {
    opacity: 0.55,
  },
  });
