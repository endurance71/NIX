import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { extractProfileQrProfileId } from '../lib/friendInvite';
import { previewProfileQr } from '../services/friendService';
import { trackEvent } from '../lib/telemetry';
import { NativeButton } from '../components/ui/native-button';
import { NativeSectionCard } from '../components/ui/native-section-card';
import { notifyError, notifyInfo } from '../lib/appNotify';
import { notify as hapticNotify } from '../lib/haptics';
import { runWithFinally } from '../lib/runWithFinally';

export default function FriendScanQrScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningLocked, setScanningLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const scanInFlightRef = useRef(false);
  const handledSuccessRef = useRef(false);

  useFocusEffect(() => {
    setScanningLocked(false);
    setLoading(false);
    scanInFlightRef.current = false;
    handledSuccessRef.current = false;
  });

  const handleScan = async (event: BarcodeScanningResult) => {
    if (scanInFlightRef.current || scanningLocked || loading) return;
    scanInFlightRef.current = true;
    setScanningLocked(true);
    setLoading(true);

    await runWithFinally(
      async () => {
        try {
          const profileId = extractProfileQrProfileId(event.data);
          if (!profileId) {
            notifyError('Niepoprawny kod', { message: 'To nie jest poprawny kod QR profilu NiX.' });
            scanInFlightRef.current = false;
            setScanningLocked(false);
            trackEvent('friend_qr_scan', {
              channel: 'qr',
              status: 'fail',
              errorCode: 'invalid_payload',
            });
            return;
          }

          const preview = await previewProfileQr(profileId);
          if (preview.status === 'invalid_profile' || !preview.profile) {
            notifyError('Nie znaleziono profilu', { message: 'Nie znaleziono profilu dla tego kodu QR.' });
            scanInFlightRef.current = false;
            setScanningLocked(false);
            trackEvent('friend_qr_scan', {
              channel: 'qr',
              status: 'fail',
              errorCode: 'invalid_profile',
            });
            return;
          }
          if (preview.status === 'own_profile') {
            notifyInfo('To Twój kod', { message: 'To jest Twój własny kod QR.' });
            scanInFlightRef.current = false;
            setScanningLocked(false);
            trackEvent('friend_qr_scan', {
              channel: 'qr',
              status: 'fail',
              errorCode: 'own_profile',
            });
            return;
          }

          if (handledSuccessRef.current) return;
          handledSuccessRef.current = true;
          trackEvent('friend_qr_scan', {
            channel: 'qr',
            status: 'success',
            result: 'preview_ok',
          });
          hapticNotify('success');
          router.push({
            pathname: '/friend-invite-confirm',
            params: {
              profileId: preview.profile.id,
              username: preview.profile.username,
            },
          });
        } catch (err: unknown) {
          notifyError('Błąd skanowania', {
            message: (err as { message?: string })?.message ?? 'Nie udało się odczytać zaproszenia.',
          });
          scanInFlightRef.current = false;
          setScanningLocked(false);
          trackEvent('friend_qr_scan', {
            channel: 'qr',
            status: 'fail',
            errorCode: (err as { message?: string })?.message ?? 'unknown',
          });
        }
      },
      () => setLoading(false)
    );
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.textPrimary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <NativeSectionCard title="Dostęp do kamery" subtitle="Aby skanować QR, potrzebny jest dostęp do kamery.">
          <NativeButton label="Udziel dostępu" onPress={requestPermission} />
        </NativeSectionCard>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanningLocked ? undefined : handleScan}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 12,
    },
    camera: {
      flex: 1,
    },
  });
