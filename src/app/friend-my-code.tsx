import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldGroup, RNHostView } from '@expo/ui';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'react-native-qrcode-svg';
import { useAppTheme } from '../hooks/useAppTheme';
import { useProfileQrPayload } from '../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../components/friend/my-profile-qr-card';
import { useAuth } from '../hooks/useAuth';
import { getCurrentUserProfile } from '../services/profileService';
import { queryKeys } from '../lib/queryKeys';
import { NativeSettingsRow } from '../components/ui/native-settings';
import { SettingsListScreen } from '../components/ui/settings-list-screen';
import { createFriendInviteShareToken } from '../services/friendService';
import { buildFriendInviteShareLink } from '../lib/friendInvite';
import { notifyDomainError } from '../lib/appNotify';
import { recordProductEvent } from '../services/productAnalyticsService';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { useSignedAvatarUrls } from '../hooks/useSignedAvatarUrls';
import { msUntilNextQrMinuteTick, qrMinutesRemaining } from '../lib/qrCountdown';
import { typography } from '../theme/typography';
import {
  boostScreenBrightnessAsync,
  restoreScreenBrightnessAsync,
} from '../../modules/nix-camera-torch';

const SHARE_QR_SIZE = 512;
const SHARE_QR_CAPTURE_TIMEOUT_MS = 1500;
const SHARE_QR_FILE_NAME = 'nix-invite-qr.png';

type ShareInviteOutcome =
  | { status: 'shared' | 'dismissed' }
  | { status: 'failed'; error: unknown };

type QrSvgHandle = { toDataURL?: (callback: (base64: string) => void) => void };

/** Writes the captured QR PNG to the cache so the share sheet gets an image, not only the link. */
async function writeShareQrImage(base64: string | null): Promise<string | null> {
  if (!base64 || !FileSystem.cacheDirectory) return null;
  try {
    const fileUri = `${FileSystem.cacheDirectory}${SHARE_QR_FILE_NAME}`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  } catch (error) {
    console.warn('[MyCode] Could not write the QR image; sharing the link only', error);
    return null;
  }
}

async function shareFriendInvite({
  title,
  messageTemplate,
  captureQrPng,
}: {
  title: string;
  messageTemplate: string;
  captureQrPng: (value: string) => Promise<string | null>;
}): Promise<ShareInviteOutcome> {
  try {
    const { token } = await createFriendInviteShareToken();
    const url = buildFriendInviteShareLink(token);
    const message = messageTemplate.replace('{{url}}', url);
    const imageUri = await writeShareQrImage(await captureQrPng(url));
    // With an image, iOS shares the picture plus the text (which carries the link).
    const result = await Share.share(imageUri ? { title, message, url: imageUri } : { title, message, url });
    return { status: result.action === Share.sharedAction ? 'shared' : 'dismissed' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

function useMyCodeProfile() {
  const { user, canUseNetworkSession } = useAuth();
  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 5,
  });
  const avatarPaths = profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : [];
  const avatarUrls = useSignedAvatarUrls(avatarPaths, { enabled: canUseNetworkSession });
  const avatarUrl = profileRow?.avatar_storage_path
    ? (avatarUrls[profileRow.avatar_storage_path] ?? null)
    : null;
  const fallbackInitial = (profileRow?.display_name?.trim() || profileRow?.username || user?.email || '?')
    .replace(/^@/, '')
    .charAt(0)
    .toUpperCase();
  return { profileRow, profilePending, avatarUrl, fallbackInitial };
}

/**
 * Like Wallet passes: full brightness while the code is on screen, put back when the screen loses
 * focus or the app goes to the background. Older binaries without the native call do nothing.
 */
function useQrScreenBrightness(codeVisible: boolean) {
  useFocusEffect(
    useCallback(() => {
      if (!codeVisible) return;
      void boostScreenBrightnessAsync();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') void boostScreenBrightnessAsync();
        else void restoreScreenBrightnessAsync();
      });
      return () => {
        subscription.remove();
        void restoreScreenBrightnessAsync();
      };
    }, [codeVisible]),
  );
}

/** Minutes left on the code, re-rendering only when the minute label changes. */
function useQrMinutesRemaining(expiresAtMs: number | null) {
  const [now, setNow] = useState(() => Date.now());
  // A refreshed token: re-read the clock right away instead of waiting for the next tick.
  useEffect(() => {
    if (expiresAtMs === null) return;
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [expiresAtMs]);
  useEffect(() => {
    if (expiresAtMs === null) return;
    const delay = msUntilNextQrMinuteTick(expiresAtMs, Date.now());
    if (delay <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [expiresAtMs, now]);
  return qrMinutesRemaining(expiresAtMs, now);
}

/** Renders a hidden QR for the share link and returns it as base64 PNG (null on failure). */
function useShareQrCapture() {
  const [value, setValue] = useState<string | null>(null);
  const svgRef = useRef<QrSvgHandle | null>(null);
  const resolveRef = useRef<((base64: string | null) => void) | null>(null);

  useEffect(() => {
    if (!value) return;
    const frame = requestAnimationFrame(() => {
      const svg = svgRef.current;
      if (!svg?.toDataURL) {
        resolveRef.current?.(null);
        return;
      }
      svg.toDataURL((base64) => resolveRef.current?.(base64));
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const capture = (nextValue: string) =>
    new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => finish(null), SHARE_QR_CAPTURE_TIMEOUT_MS);
      function finish(base64: string | null) {
        clearTimeout(timer);
        resolveRef.current = null;
        setValue(null);
        resolve(base64);
      }
      resolveRef.current = finish;
      setValue(nextValue);
    });

  const element = value ? (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.hiddenShareQr}>
      <QRCode
        value={value}
        size={SHARE_QR_SIZE}
        ecl="Q"
        quietZone={32}
        getRef={(ref: QrSvgHandle | null) => {
          svgRef.current = ref;
        }}
      />
    </View>
  ) : null;

  return { capture, element };
}

export default function FriendMyCodeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { canUseNetworkSession } = useAuth();
  const qrPayload = useProfileQrPayload(canUseNetworkSession);
  const [shareBusy, setShareBusy] = useState(false);
  const { profileRow, profilePending, avatarUrl, fallbackInitial } = useMyCodeProfile();
  const qrSize = Math.max(180, Math.min(236, width - 112));
  const codeVisible = canUseNetworkSession && Boolean(qrPayload.payload);
  const minutesLeft = useQrMinutesRemaining(qrPayload.expiresAtMs);
  const qrRefreshing = codeVisible && minutesLeft === 0;
  // VoiceOver hears the refresh once; the minute countdown is read on focus, not announced.
  useEffect(() => {
    if (qrRefreshing) AccessibilityInfo.announceForAccessibility(t('profile.qrRefreshing'));
  }, [qrRefreshing, t]);
  const shareQr = useShareQrCapture();
  useQrScreenBrightness(codeVisible);

  const displayName = profileRow?.display_name?.trim() || null;
  const username = profileRow?.username ?? null;

  const handleShareInvite = async () => {
    if (shareBusy || !canUseNetworkSession) return;
    setShareBusy(true);
    const result = await shareFriendInvite({
      title: t('profile.shareInviteTitle'),
      messageTemplate: t('profile.shareInviteMessage', { url: '{{url}}' }),
      captureQrPng: shareQr.capture,
    });
    if (result.status === 'shared') {
      void recordProductEvent('invite_shared', { channel: 'share' });
    } else if (result.status === 'failed') {
      notifyDomainError(result.error, t('profile.shareInviteFailure'));
    }
    setShareBusy(false);
  };

  return (
    <>
      <SettingsListScreen loading={canUseNetworkSession && profilePending}>
        <FieldGroup.Section>
          <FieldGroup.SectionHeader>
            <RNHostView matchContents>
              <View style={styles.header}>
                <Text style={[styles.description, { color: colors.secondaryLabel }]}>
                  {t('profile.qrDescription')}
                </Text>
                <View style={styles.qrSlot}>
                  {/* Background token refreshes keep the current code on screen. */}
                  {canUseNetworkSession && qrPayload.loading && !qrPayload.payload ? (
                    <View style={styles.loading}>
                      <ActivityIndicator color={colors.label} />
                      <Text style={[styles.loadingText, { color: colors.secondaryLabel }]}>
                        {t('profile.qrGenerating')}
                      </Text>
                    </View>
                  ) : (
                    <MyProfileQrCard
                      payload={qrPayload.payload}
                      colors={colors}
                      error={
                        canUseNetworkSession ? qrPayload.error : t('root.offlineActionUnavailable')
                      }
                      size={qrSize}
                      centerOverlayRatio={0.28}
                      avatarUrl={avatarUrl}
                      avatarStoragePath={profileRow?.avatar_storage_path ?? null}
                      avatarEmoji={profileRow?.avatar_emoji}
                      fallbackInitial={fallbackInitial}
                    />
                  )}
                </View>
                {username ? (
                  <View style={styles.identity}>
                    <Text
                      numberOfLines={1}
                      style={[styles.identityName, { color: colors.label }]}>
                      {displayName ?? `@${username}`}
                    </Text>
                    {displayName ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.identityUsername, { color: colors.secondaryLabel }]}>
                        @{username}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {codeVisible && minutesLeft !== null ? (
                  <Text style={[styles.validity, { color: colors.secondaryLabel }]}>
                    {minutesLeft > 0
                      ? t('profile.qrValidFor', { count: minutesLeft })
                      : t('profile.qrRefreshing')}
                  </Text>
                ) : null}
              </View>
            </RNHostView>
          </FieldGroup.SectionHeader>
          {canUseNetworkSession && qrPayload.error && !qrPayload.loading ? (
            <NativeSettingsRow
              title={t('common.retry')}
              icon="retry"
              onPress={() => void qrPayload.refresh()}
              testID="my-code-retry"
            />
          ) : null}
          {iosRoadmapFeatures.shareInvites ? (
            <NativeSettingsRow
              title={shareBusy ? t('profile.shareInviteLoading') : t('profile.shareInvite')}
              icon="share"
              disabled={shareBusy || !canUseNetworkSession}
              onPress={() => void handleShareInvite()}
              testID="my-code-share"
            />
          ) : null}
          <NativeSettingsRow
            title={t('profile.scanQr')}
            icon="qrcode"
            showsChevron
            onPress={() => router.push({ pathname: '/friend-scan-qr', params: { from: 'my-code' } })}
            testID="my-code-scan"
          />
        </FieldGroup.Section>
      </SettingsListScreen>
      {shareQr.element}
      <Stack.Screen.Title style={{ color: colors.label }}>
        {t('profile.myQrCode')}
      </Stack.Screen.Title>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
  },
  description: {
    ...typography.subheadline,
    maxWidth: 340,
    textAlign: 'center',
    marginBottom: 20,
  },
  qrSlot: {
    minHeight: 276,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.footnote,
    marginTop: 12,
  },
  identity: {
    marginTop: 14,
    alignItems: 'center',
    gap: 2,
    maxWidth: 320,
  },
  identityName: {
    ...typography.headline,
  },
  identityUsername: {
    ...typography.callout,
  },
  validity: {
    ...typography.footnote,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  hiddenShareQr: {
    position: 'absolute',
    left: -10_000,
    top: 0,
    opacity: 0,
  },
});
