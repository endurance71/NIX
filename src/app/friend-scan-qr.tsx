import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { APP_FONT_FAMILY } from '../theme/typography';
import { extractFriendInvitePayload } from '../lib/friendInvite';
import {
  friendErrorTelemetryCode,
  previewFriendInviteToken,
  previewProfileQr,
  type FriendProfile,
} from '../services/friendService';
import { trackEvent } from '../lib/telemetry';
import { Button } from '../components/ui/button';
import { NativeSectionCard } from '../components/ui/native-section-card';
import { NativeChromeIconButton } from '../components/ui/native-chrome-icon-button';
import { NativeGlassPill } from '../components/ui/native-glass-pill';
import { AppBottomSheet } from '../components/ui/app-bottom-sheet';
import { FriendInviteConfirmContent } from '../components/friend/friend-invite-confirm-content';
import i18n from '../lib/i18n';
import { notifyDomainError, notifyError, notifyInfo } from '../lib/appNotify';
import { notify as hapticNotify } from '../lib/haptics';
import { runWithFinally } from '../lib/runWithFinally';
import { paramFirst } from '../lib/previewRoute';
import { scannedCodeFrame, viewfinderRect, type ScanRect } from '../lib/qrScanFrame';
import { useMotionEnabled } from '../theme/motion';
import { useScreenInsets } from '../hooks/useScreenInsets';

type ScannedData = {
  profileId?: string;
  token?: string;
  username: string;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  profile: FriendProfile;
};

type ScanSource = 'camera' | 'photo';

const REJECTED_SCAN_COOLDOWN_MS = 3_000;
/** Frame „snaps” onto the detected code, then the confirm sheet opens. */
const SNAP_DURATION_MS = 220;
const SNAP_EASING = Easing.bezier(0.23, 1, 0.32, 1);
const VIEWFINDER_BORDER = 3;

type PreviewOutcome =
  | { ok: true; data: ScannedData }
  | { ok: false; kind: 'error' | 'info'; title: string; message: string; errorCode: string };

async function previewScannedPayload(raw: string): Promise<PreviewOutcome> {
  const payload = extractFriendInvitePayload(raw);
  if (!payload?.token && !payload?.profileId) {
    return {
      ok: false,
      kind: 'error',
      title: i18n.t('notify.invalidQr'),
      message: i18n.t('notify.invalidQrBody'),
      errorCode: 'invalid_payload',
    };
  }
  if (payload.token) {
    const preview = await previewFriendInviteToken(payload.token);
    if (preview.status === 'own_invite') {
      return {
        ok: false,
        kind: 'info',
        title: i18n.t('notify.ownQr'),
        message: i18n.t('notify.ownQrBody'),
        errorCode: 'own_invite',
      };
    }
    if (preview.status === 'invalid_or_expired' || !preview.profile) {
      return {
        ok: false,
        kind: 'error',
        title: i18n.t('notify.invalidQr'),
        message: i18n.t('notify.expiredQrBody'),
        errorCode: 'invalid_or_expired',
      };
    }
    return {
      ok: true,
      data: {
        token: payload.token,
        username: preview.profile.username,
        avatarStoragePath: preview.profile.avatar_storage_path ?? null,
        avatarEmoji: preview.profile.avatar_emoji ?? null,
        profile: preview.profile,
      },
    };
  }
  const preview = await previewProfileQr(payload.profileId ?? '');
  if (preview.status === 'own_profile') {
    return {
      ok: false,
      kind: 'info',
      title: i18n.t('notify.ownQr'),
      message: i18n.t('notify.ownQrBody'),
      errorCode: 'own_profile',
    };
  }
  if (preview.status === 'invalid_profile' || !preview.profile) {
    return {
      ok: false,
      kind: 'error',
      title: i18n.t('notify.profileNotFound'),
      message: i18n.t('notify.qrProfileNotFound'),
      errorCode: 'invalid_profile',
    };
  }
  return {
    ok: true,
    data: {
      profileId: preview.profile.id,
      username: preview.profile.username,
      avatarStoragePath: preview.profile.avatar_storage_path ?? null,
      avatarEmoji: preview.profile.avatar_emoji ?? null,
      profile: preview.profile,
    },
  };
}

/** Viewfinder that rests in the middle and snaps onto a detected code (no motion with Reduce Motion). */
function useViewfinderFrame(motionEnabled: boolean) {
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const placeAtRest = useCallback(
    (size: { width: number; height: number }) => {
      if (size.width <= 0 || size.height <= 0) return;
      const rest = viewfinderRect(size.width, size.height);
      x.set(rest.x);
      y.set(rest.y);
      width.set(rest.width);
      height.set(rest.height);
    },
    [height, width, x, y],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
    setViewSize(next);
    placeAtRest(next);
  };

  const snapTo = (rect: ScanRect) => {
    const timing = { duration: SNAP_DURATION_MS, easing: SNAP_EASING };
    x.set(withTiming(rect.x, timing));
    y.set(withTiming(rect.y, timing));
    width.set(withTiming(rect.width, timing));
    height.set(withTiming(rect.height, timing));
  };

  // Absolutely positioned and childless, so animating its box does not re-lay out anything else.
  const frameStyle = useAnimatedStyle(() => ({
    left: x.get(),
    top: y.get(),
    width: width.get(),
    height: height.get(),
  }));

  const rest = viewSize.width > 0 ? viewfinderRect(viewSize.width, viewSize.height) : null;

  return {
    viewSize,
    rest,
    onLayout,
    frameStyle,
    snapTo: motionEnabled ? snapTo : null,
    reset: () => placeAtRest(viewSize),
  };
}

/** Loading and camera-permission states, shown instead of the scanner. */
function ScannerPermissionGate({
  permission,
  requestPermission,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const canAskAgain = permission?.canAskAgain !== false;
  return (
    <View style={[styles.container, styles.center]}>
      {/* No camera behind the header here: system tint and title colors. */}
      <Stack.Screen
        options={{
          headerTintColor: colors.accentText,
          headerTitleStyle: { fontFamily: APP_FONT_FAMILY, fontWeight: '700', color: colors.label },
        }}
      />
      {!permission ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <NativeSectionCard
          title={t('camera.qrPermissionTitle')}
          subtitle={canAskAgain ? t('camera.qrPermissionBody') : t('camera.qrPermissionDeniedBody')}>
          <Button
            size="large"
            fullWidth
            title={canAskAgain ? t('camera.grantAccess') : t('camera.openSettings')}
            onPress={canAskAgain ? () => void requestPermission() : () => void Linking.openSettings()}
          />
        </NativeSectionCard>
      )}
    </View>
  );
}

export default function FriendScanQrScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const motionEnabled = useMotionEnabled();
  const params = useLocalSearchParams<{ from?: string }>();
  const openedFromMyCode = paramFirst(params.from) === 'my-code';
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningLocked, setScanningLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [sheetPresented, setSheetPresented] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const viewfinder = useViewfinderFrame(motionEnabled);
  const { bottom: bottomInset } = useScreenInsets('fullscreen');
  const { width: windowWidth } = useWindowDimensions();

  const scanInFlightRef = useRef(false);
  const handledSuccessRef = useRef(false);
  const sheetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A rejected code usually stays in frame; ignore it for a moment instead of firing another
  // request and toast on every camera frame.
  const rejectedScanRef = useRef<{ data: string; at: number } | null>(null);

  useEffect(
    () => () => {
      if (sheetTimerRef.current) clearTimeout(sheetTimerRef.current);
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      setScanningLocked(false);
      setLoading(false);
      setSheetPresented(false);
      setScannedData(null);
      scanInFlightRef.current = false;
      handledSuccessRef.current = false;
      // Leaving the scanner (e.g. into a chat) switches the flashlight off.
      return () => setTorchOn(false);
    }, []),
  );

  const requestSheetDismiss = () => {
    setSheetPresented(false);
  };

  const handleSheetDismissed = () => {
    setSheetPresented(false);
    setScannedData(null);
    setScanningLocked(false);
    scanInFlightRef.current = false;
    handledSuccessRef.current = false;
    viewfinder.reset();
  };

  const rejectScan = (data: string) => {
    scanInFlightRef.current = false;
    rejectedScanRef.current = { data, at: Date.now() };
    setScanningLocked(false);
  };

  const processScan = async (data: string, source: ScanSource, codeFrame: ScanRect | null) => {
    const rejected = rejectedScanRef.current;
    if (rejected && rejected.data === data && Date.now() - rejected.at < REJECTED_SCAN_COOLDOWN_MS) {
      return;
    }
    if (scanInFlightRef.current || handledSuccessRef.current || scannedData) return;
    scanInFlightRef.current = true;
    setScanningLocked(true);
    setLoading(true);

    await runWithFinally(
      async () => {
        try {
          const outcome = await previewScannedPayload(data);
          if (!outcome.ok) {
            if (outcome.kind === 'info') notifyInfo(outcome.title, { message: outcome.message });
            else notifyError(outcome.title, { message: outcome.message });
            rejectScan(data);
            trackEvent('friend_qr_scan', {
              channel: 'qr',
              status: 'fail',
              errorCode: outcome.errorCode,
              source,
            });
            return;
          }
          if (handledSuccessRef.current) return;
          handledSuccessRef.current = true;
          trackEvent('friend_qr_scan', {
            channel: 'qr',
            status: 'success',
            result: 'preview_ok',
            source,
          });
          hapticNotify('success');
          setScannedData(outcome.data);
          const snapTo = viewfinder.snapTo;
          if (codeFrame && snapTo) {
            snapTo(codeFrame);
            sheetTimerRef.current = setTimeout(() => setSheetPresented(true), SNAP_DURATION_MS);
          } else {
            setSheetPresented(true);
          }
        } catch (err: unknown) {
          notifyDomainError(err, i18n.t('notify.inviteReadFailed'));
          rejectScan(data);
          trackEvent('friend_qr_scan', {
            channel: 'qr',
            status: 'fail',
            errorCode: friendErrorTelemetryCode(err),
            source,
          });
        }
      },
      () => setLoading(false),
    );
  };

  const handleBarcodeScanned = (event: BarcodeScanningResult) => {
    const frame = scannedCodeFrame({
      cornerPoints: event.cornerPoints,
      bounds: event.bounds,
      viewWidth: viewfinder.viewSize.width,
      viewHeight: viewfinder.viewSize.height,
    });
    void processScan(event.data, 'camera', frame);
  };

  const scanFromPhoto = async () => {
    if (scanInFlightRef.current || scannedData) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
      if (!uri) return;
      const results = await scanFromURLAsync(uri, ['qr']);
      const code = results.find((result) => Boolean(result.data));
      if (!code) {
        hapticNotify('error');
        notifyError(t('friends.noCodeInPhoto'));
        return;
      }
      await processScan(code.data, 'photo', null);
    } catch (error) {
      notifyDomainError(error, t('friends.scanFromPhotoFailed'));
    }
  };

  const showMyCode = () => {
    if (openedFromMyCode && router.canGoBack()) router.back();
    else router.push('/friend-my-code');
  };

  if (!permission || !permission.granted) {
    return <ScannerPermissionGate permission={permission} requestPermission={requestPermission} />;
  }

  const scanningPaused = scanningLocked || Boolean(scannedData);

  return (
    <View style={styles.cameraContainer} onLayout={viewfinder.onLayout}>
      <Stack.Screen
        options={{
          headerTintColor: colors.cameraControlTint,
          headerTitleStyle: {
            fontFamily: APP_FONT_FAMILY,
            fontWeight: '700',
            color: colors.cameraControlTint,
          },
        }}
      />
      <StatusBar style="light" />
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('friends.scannerPreviewA11y')}
        accessibilityHint={t('friends.scanInstruction')}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanningPaused ? undefined : handleBarcodeScanned}
        />
      </View>

      {viewfinder.rest ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.viewfinder, { borderColor: colors.cameraControlTint }, viewfinder.frameStyle]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.instructionWrap,
              { top: viewfinder.rest.y + viewfinder.rest.height + 20 },
            ]}>
            {/* Hidden from VoiceOver: the screen's own label already says it. */}
            <NativeGlassPill
              label={t('friends.scanInstruction')}
              tintColor={colors.cameraControlTint}
              fill={colors.cinemaScrim}
              textStyle="callout"
              numberOfLines={0}
              cornerRadius={16}
              size="compact"
              maxWidth={windowWidth - INSTRUCTION_SIDE_INSET * 2}
              accessibilityHidden
            />
          </View>
        </>
      ) : null}

      <View
        style={[styles.controls, { bottom: bottomInset + 24 }]}
        pointerEvents={scannedData ? 'none' : 'box-none'}>
        <NativeChromeIconButton
          name={torchOn ? 'torchOn' : 'torchOff'}
          accessibilityLabel={torchOn ? t('friends.torchOff') : t('friends.torchOn')}
          onPress={() => setTorchOn((value) => !value)}
          backgroundColor={colors.cameraControlBackground}
          tintColor={colors.cameraControlTint}
          chromeVariant="glass"
        />
        <NativeChromeIconButton
          name="photoLibrary"
          accessibilityLabel={t('friends.scanFromPhoto')}
          onPress={() => void scanFromPhoto()}
          disabled={loading}
          backgroundColor={colors.cameraControlBackground}
          tintColor={colors.cameraControlTint}
          chromeVariant="glass"
        />
        <NativeChromeIconButton
          name="myQrCode"
          accessibilityLabel={t('friends.showMyCode')}
          onPress={showMyCode}
          backgroundColor={colors.cameraControlBackground}
          tintColor={colors.cameraControlTint}
          chromeVariant="glass"
        />
      </View>

      {loading && !scannedData ? (
        <View
          style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.cinemaScrim }]}>
          <ActivityIndicator size="large" color={colors.cameraControlTint} />
        </View>
      ) : null}

      <AppBottomSheet isPresented={sheetPresented} onDismiss={handleSheetDismissed}>
        {scannedData ? (
          <FriendInviteConfirmContent
            profileId={scannedData.profileId}
            token={scannedData.token}
            username={scannedData.username}
            avatarStoragePath={scannedData.avatarStoragePath}
            avatarEmoji={scannedData.avatarEmoji}
            initialProfile={scannedData.profile}
            onDismiss={requestSheetDismiss}
          />
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

const INSTRUCTION_SIDE_INSET = 24;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    cameraContainer: {
      flex: 1,
      backgroundColor: colors.cinemaBackground,
    },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 12,
    },
    viewfinder: {
      position: 'absolute',
      borderWidth: VIEWFINDER_BORDER,
      borderRadius: 24,
      borderCurve: 'continuous',
    },
    instructionWrap: {
      position: 'absolute',
      left: INSTRUCTION_SIDE_INSET,
      right: INSTRUCTION_SIDE_INSET,
      alignItems: 'center',
    },
    controls: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 28,
    },
  });
