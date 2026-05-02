import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { CameraView, BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { extractProfileQrProfileId } from '../lib/friendInvite';
import { previewProfileQr } from '../services/friendService';
import { trackEvent } from '../lib/telemetry';
import { NativeButton } from '../components/ui/native-button';
import { NativeSectionCard } from '../components/ui/native-section-card';

export default function FriendScanQrScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningLocked, setScanningLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const scanInFlightRef = useRef(false);
  const handledSuccessRef = useRef(false);
  const sheetOpenedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setScanningLocked(false);
      setLoading(false);
      scanInFlightRef.current = false;
      handledSuccessRef.current = false;
      sheetOpenedRef.current = false;
    }, [])
  );

  useEffect(() => {
    if (sheetOpenedRef.current) return;
    sheetOpenedRef.current = true;
    router.push('/friend-scan-qr-sheet');
  }, []);

  const handleScan = async (event: BarcodeScanningResult) => {
    if (scanInFlightRef.current || scanningLocked || loading) return;
    scanInFlightRef.current = true;
    setScanningLocked(true);
    setLoading(true);

    try {
      const profileId = extractProfileQrProfileId(event.data);
      if (!profileId) {
        Alert.alert('Niepoprawny kod', 'To nie jest poprawny kod QR profilu NiX.');
        scanInFlightRef.current = false;
        trackEvent('friend_qr_scan', {
          channel: 'qr',
          status: 'fail',
          errorCode: 'invalid_payload',
        });
        return;
      }

      const preview = await previewProfileQr(profileId);
      if (preview.status === 'invalid_profile' || !preview.profile) {
        Alert.alert('Nie znaleziono profilu', 'Nie znaleziono profilu dla tego kodu QR.');
        scanInFlightRef.current = false;
        trackEvent('friend_qr_scan', {
          channel: 'qr',
          status: 'fail',
          errorCode: 'invalid_profile',
        });
        return;
      }
      if (preview.status === 'own_profile') {
        Alert.alert('To Twój kod', 'To jest Twój własny kod QR.');
        scanInFlightRef.current = false;
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
      router.push({
        pathname: '/friend-invite-confirm',
        params: {
          profileId: preview.profile.id,
          username: preview.profile.username,
        },
      });
    } catch (err: any) {
      Alert.alert('Błąd skanowania', err?.message ?? 'Nie udało się odczytać zaproszenia.');
      scanInFlightRef.current = false;
      trackEvent('friend_qr_scan', {
        channel: 'qr',
        status: 'fail',
        errorCode: err?.message ?? 'unknown',
      });
    } finally {
      setLoading(false);
    }
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
