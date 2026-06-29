import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { extractFriendInvitePayload } from '../lib/friendInvite';
import {
  FriendInviteRelationStatus,
  FriendProfile,
  getFriendInviteRelationStatus,
  previewFriendInviteToken,
  previewProfileQr,
  redeemFriendInviteToken,
  sendFriendRequestByProfileQr,
} from '../services/friendService';
import { createSignedAvatarUrl } from '../services/avatarService';
import { trackEvent } from '../lib/telemetry';
import { NativeButton } from '../components/ui/native-button';
import { NativeSectionCard } from '../components/ui/native-section-card';
import { notifyError, notifyInfo, notifySuccess, notifyShow } from '../lib/appNotify';
import { notify as hapticNotify, tap } from '../lib/haptics';
import { runWithFinally } from '../lib/runWithFinally';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { AppIcon } from '../components/ui/app-icon';
import { AppBottomSheet } from '../components/ui/app-bottom-sheet';
import {
  ACTION_SHEET_AVATAR_SIZE,
  ActionSheetPrimaryButton,
  ActionSheetSecondaryButton,
  ActionSheetSurface,
} from '../components/ui/action-sheet-surface';
import { queryKeys } from '../lib/queryKeys';
import { APP_FONT_FAMILY } from '../theme/typography';

type ScannedData = {
  profileId?: string;
  token?: string;
  username: string;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
};

const QR_CONFIRMATION_SHEET_HEIGHT = 450;

export default function FriendScanQrScreen() {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningLocked, setScanningLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);

  const scanInFlightRef = useRef(false);
  const handledSuccessRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setScanningLocked(false);
      setLoading(false);
      setScannedData(null);
      scanInFlightRef.current = false;
      handledSuccessRef.current = false;
    }, [])
  );

  const handleScan = async (event: BarcodeScanningResult) => {
    if (scanInFlightRef.current || scanningLocked || loading) return;
    scanInFlightRef.current = true;
    setScanningLocked(true);
    setLoading(true);

    await runWithFinally(
      async () => {
        try {
          const payload = extractFriendInvitePayload(event.data);
          if (!payload?.token && !payload?.profileId) {
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

          if (payload.token) {
            const preview = await previewFriendInviteToken(payload.token);
            if (preview.status === 'invalid_or_expired' || !preview.profile) {
              notifyError('Niepoprawny kod', { message: 'Kod QR jest nieprawidłowy, wygasły lub został już użyty.' });
              scanInFlightRef.current = false;
              setScanningLocked(false);
              trackEvent('friend_qr_scan', {
                channel: 'qr',
                status: 'fail',
                errorCode: 'invalid_or_expired',
              });
              return;
            }
            if (preview.status === 'own_invite') {
              notifyInfo('To Twój kod', { message: 'To jest Twój własny kod QR.' });
              scanInFlightRef.current = false;
              setScanningLocked(false);
              trackEvent('friend_qr_scan', {
                channel: 'qr',
                status: 'fail',
                errorCode: 'own_invite',
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
            setScannedData({
              token: payload.token,
              username: preview.profile.username,
              avatarStoragePath: preview.profile.avatar_storage_path ?? null,
              avatarEmoji: preview.profile.avatar_emoji ?? null,
            });
            return;
          }

          const preview = await previewProfileQr(payload.profileId ?? '');
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
          setScannedData({
            profileId: preview.profile.id,
            username: preview.profile.username,
            avatarStoragePath: preview.profile.avatar_storage_path ?? null,
            avatarEmoji: preview.profile.avatar_emoji ?? null,
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

  const handleSheetDismiss = () => {
    setScannedData(null);
    setScanningLocked(false);
    scanInFlightRef.current = false;
    handledSuccessRef.current = false;
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
      {loading && !scannedData && (
        <View style={StyleSheet.absoluteFill}>
          <View style={[styles.container, styles.center, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        </View>
      )}

      <AppBottomSheet
        isPresented={scannedData !== null}
        onDismiss={handleSheetDismiss}
        snapPoints={[{ height: QR_CONFIRMATION_SHEET_HEIGHT }]}
      >
        {scannedData ? (
          <FriendInviteConfirmSheetContent
            profileId={scannedData.profileId}
            token={scannedData.token}
            username={scannedData.username}
            avatarStoragePath={scannedData.avatarStoragePath}
            avatarEmoji={scannedData.avatarEmoji}
            onDismiss={handleSheetDismiss}
          />
        ) : null}
      </AppBottomSheet>
    </View>
  );
}

function FriendInviteConfirmSheetContent({
  profileId,
  token,
  username,
  avatarStoragePath,
  avatarEmoji,
  onDismiss,
}: {
  profileId?: string;
  token?: string;
  username: string;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  onDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = createSheetStyles(colors);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendProfile, setFriendProfile] = useState<FriendProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [relationStatus, setRelationStatus] = useState<FriendInviteRelationStatus>('none');
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfileData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const preview = token
        ? await previewFriendInviteToken(token)
        : await previewProfileQr(profileId ?? '');

      if (preview.status === 'invalid_profile' || preview.status === 'invalid_or_expired' || !preview.profile) {
        setError('Nie udało się wczytać tego profilu.');
        return;
      }

      if (preview.status === 'own_profile' || preview.status === 'own_invite') {
        setError('To jest Twój profil.');
        return;
      }

      const mergedProfile: FriendProfile = {
        ...preview.profile,
        avatar_storage_path: preview.profile.avatar_storage_path ?? avatarStoragePath,
        avatar_emoji: preview.profile.avatar_emoji ?? avatarEmoji,
      };

      let nextAvatarUrl: string | null = null;
      if (mergedProfile.avatar_storage_path) {
        try {
          nextAvatarUrl = await createSignedAvatarUrl(mergedProfile.avatar_storage_path);
        } catch (err) {
          console.warn('Failed to load friend avatar signed URL', err);
        }
      }

      let nextRelationStatus: FriendInviteRelationStatus = 'none';
      try {
        nextRelationStatus = await getFriendInviteRelationStatus(preview.profile.id);
      } catch {
        nextRelationStatus = 'none';
      }

      setFriendProfile(mergedProfile);
      setAvatarUrl(nextAvatarUrl);
      setRelationStatus(nextRelationStatus);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nie udało się wczytać profilu.');
    } finally {
      setLoading(false);
    }
  }, [profileId, token, avatarStoragePath, avatarEmoji]);

  useEffect(() => {
    const loadProfileDataId = setTimeout(() => {
      void loadProfileData();
    }, 0);

    return () => {
      clearTimeout(loadProfileDataId);
    };
  }, [loadProfileData]);

  const displayUsername = friendProfile?.username ?? username;
  const statusLine = relationStatusCopy(relationStatus);

  const primaryLabel = () =>
    relationStatus === 'incoming_pending' ? 'Zaakceptuj zaproszenie' : 'Dodaj znajomego';

  const handleSend = async () => {
    if (!profileId && !token) {
      notifyError('Brak danych', { message: 'Nie udało się odczytać profilu z kodu QR.' });
      return;
    }

    if (relationStatus === 'already_friends' || relationStatus === 'outgoing_pending') {
      return;
    }

    tap('heavy');
    setActionLoading(true);
    await runWithFinally(
      async () => {
        const result = token
          ? await redeemFriendInviteToken(token)
          : await sendFriendRequestByProfileQr(profileId ?? '');
        const resultCode = result.result;
        const resultProfile = 'inviterProfile' in result ? result.inviterProfile : result.profile;
        trackEvent('friend_invite_redeem', {
          channel: 'qr',
          status: 'success',
          result: resultCode,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
        void queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests });
        void queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests });
        const message = mapConfirmationMessage(resultCode, resultProfile?.username ?? displayUsername);
        switch (resultCode) {
          case 'request_sent':
          case 'already_friends':
          case 'accepted_reverse_request':
            notifySuccess('Potwierdzenie', { message });
            break;
          case 'already_requested':
            notifyInfo('Potwierdzenie', { message });
            break;
          case 'own_profile':
          case 'invalid_profile':
            notifyError('Potwierdzenie', { message });
            break;
          default:
            notifyShow({ title: 'Potwierdzenie', message });
        }
        onDismiss();
        router.replace('/(tabs)/profile');
      },
      () => setActionLoading(false)
    ).catch((err: unknown) => {
      trackEvent('friend_invite_redeem', {
        channel: 'qr',
        status: 'fail',
        errorCode: (err as { message?: string })?.message ?? 'unknown',
      });
      notifyError('Błąd', {
        message: (err as { message?: string })?.message ?? 'Nie udało się wysłać zaproszenia.',
      });
    });
  };

  if (loading) {
    return (
      <ActionSheetSurface title="Dodaj znajomego" message="Profil odczytany z kodu QR.">
        <View style={styles.loaderContent}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={[styles.loaderLabel, { color: colors.textSecondary }]}>Ładowanie profilu…</Text>
        </View>
      </ActionSheetSurface>
    );
  }

  if (error) {
    return (
      <ActionSheetSurface
        title="Dodaj znajomego"
        message={error}
        actions={<ActionSheetSecondaryButton label="Zamknij" onPress={onDismiss} />}
      />
    );
  }

  return (
    <ActionSheetSurface
      title="Dodaj znajomego"
      message="Profil odczytany z kodu QR. Dodanie wymaga akceptacji drugiej osoby."
      contentAlign="stretch"
      actions={
        <>
          {(relationStatus === 'none' || relationStatus === 'incoming_pending') && (
            <ActionSheetPrimaryButton
              label={primaryLabel()}
              loading={actionLoading}
              onPress={handleSend}
            />
          )}
          <ActionSheetSecondaryButton
            label={relationStatus === 'already_friends' || relationStatus === 'outgoing_pending' ? 'Zamknij' : 'Anuluj'}
            onPress={onDismiss}
            disabled={actionLoading}
          />
        </>
      }
    >
      <View style={styles.avatarContainer}>
        <AvatarCircle
          size={ACTION_SHEET_AVATAR_SIZE}
          url={avatarUrl}
          storagePath={friendProfile?.avatar_storage_path}
          emoji={friendProfile?.avatar_emoji}
          fallbackInitial={displayUsername.charAt(0)}
        />
      </View>

      <Text style={[styles.handle, { color: colors.textPrimary }]} numberOfLines={1}>
        @{displayUsername || 'nieznany'}
      </Text>

      {statusLine ? (
        <View style={styles.statusBlock}>
          {relationStatus === 'already_friends' ? (
            <AppIcon name="checkCircle" size={22} color={colors.success} />
          ) : relationStatus === 'outgoing_pending' ? (
            <AppIcon name="clock" size={20} color={colors.textMuted} />
          ) : (
            <AppIcon name="personAdd" size={20} color={colors.accent} />
          )}
          <Text
            style={[
              styles.statusLineText,
              { color: relationStatus === 'already_friends' ? colors.success : colors.textSecondary },
            ]}
          >
            {statusLine}
          </Text>
        </View>
      ) : null}
    </ActionSheetSurface>
  );
}

function mapConfirmationMessage(result: string, username?: string) {
  if (result === 'request_sent') return `Zaproszenie do @${username ?? 'użytkownika'} zostało wysłane.`;
  if (result === 'already_requested') return 'Zaproszenie zostało już wysłane wcześniej.';
  if (result === 'already_friends') return `Jesteście już znajomymi${username ? ` z @${username}` : ''}.`;
  if (result === 'accepted_reverse_request') return `Zaakceptowano zaproszenie od @${username ?? 'użytkownika'}.`;
  if (result === 'own_profile') return 'Nie możesz dodać samego siebie.';
  return 'Nie udało się wysłać zaproszenia.';
}

function relationStatusCopy(status: FriendInviteRelationStatus): string | null {
  if (status === 'already_friends') return 'Jesteście już znajomymi — nie musisz wysyłać zaproszenia.';
  if (status === 'outgoing_pending') return 'Zaproszenie do tej osoby czeka już na akceptację.';
  if (status === 'incoming_pending') return 'Ta osoba wysłała Ci zaproszenie — możesz je zaakceptować.';
  return null;
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

const createSheetStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loaderContent: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 4,
    },
    loaderLabel: {
      fontSize: 15,
      fontFamily: APP_FONT_FAMILY,
    },
    avatarContainer: {
      alignItems: 'center',
      marginVertical: 4,
    },
    handle: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      fontFamily: APP_FONT_FAMILY,
      textAlign: 'center',
      letterSpacing: -0.2,
    },
    statusBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginTop: 2,
      marginBottom: 2,
      borderRadius: 14,
      backgroundColor: colors.secondarySystemFill,
    },
    statusLineText: {
      fontSize: 15,
      lineHeight: 21,
      fontFamily: APP_FONT_FAMILY,
      fontWeight: '500',
      textAlign: 'center',
      paddingHorizontal: 10,
    },
  });
