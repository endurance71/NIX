import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { ThemeColors } from '../../theme/colors';
import { APP_FONT_FAMILY } from '../../theme/typography';

type MyProfileQrCardProps = {
  payload: string | null;
  colors: ThemeColors;
  size?: number;
  error?: string | null;
  centerOverlayRatio?: number;
  avatarUrl?: string | null;
  /** Ścieżka w bucketcie — stabilny klucz cache dla expo-image przy podpisanych URL. */
  avatarStoragePath?: string | null;
  avatarEmoji?: string | null;
  fallbackInitial?: string | null;
};

export function MyProfileQrCard({
  payload,
  colors,
  size = 220,
  error,
  centerOverlayRatio = 0.22,
  avatarUrl,
  avatarStoragePath,
  avatarEmoji,
  fallbackInitial,
}: MyProfileQrCardProps) {
  const safeOverlayRatio = Math.min(0.32, Math.max(0.2, centerOverlayRatio));
  const logoSize = Math.round(size * safeOverlayRatio);
  const innerContentSize = logoSize * 0.72;
  const [failedForAvatarUrl, setFailedForAvatarUrl] = useState<string | null>(null);
  const avatarLoadFailed = Boolean(avatarUrl) && failedForAvatarUrl === avatarUrl;
  const shouldShowAvatarImage = Boolean(avatarUrl) && !avatarLoadFailed;
  const normalizedInitial = (fallbackInitial ?? '?').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        {payload ? (
          <View style={styles.qrWrapper}>
            <QRCode value={payload} size={size} />
            <View style={[styles.logoBackdrop, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
              {shouldShowAvatarImage ? (
                <ExpoImage
                  cachePolicy="memory-disk"
                  source={{
                    uri: avatarUrl ?? '',
                    ...(avatarStoragePath ? { cacheKey: avatarStoragePath } : {}),
                  }}
                  style={{ width: innerContentSize, height: innerContentSize, borderRadius: innerContentSize / 2 }}
                  contentFit="cover"
                  onError={() => setFailedForAvatarUrl(avatarUrl ?? null)}
                />
              ) : avatarEmoji ? (
                <Text style={[styles.avatarEmoji, { color: colors.textPrimary, fontSize: innerContentSize * 0.62 }]}>
                  {avatarEmoji}
                </Text>
              ) : fallbackInitial ? (
                <Text style={[styles.avatarInitial, { color: colors.textPrimary, fontSize: innerContentSize * 0.46 }]}>
                  {normalizedInitial}
                </Text>
              ) : (
                <ExpoImage
                  source={require('../../../nix-icons/icon.png')}
                  style={{ width: innerContentSize, height: innerContentSize, borderRadius: innerContentSize / 4 }}
                  contentFit="cover"
                />
              )}
            </View>
          </View>
        ) : (
          <Text style={[styles.errorText, { color: colors.error }]}>{error ?? 'Brak danych profilu do QR.'}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  card: {
    width: 260,
    height: 260,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBackdrop: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    textAlign: 'center',
  },
  avatarInitial: {
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    fontFamily: APP_FONT_FAMILY,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
