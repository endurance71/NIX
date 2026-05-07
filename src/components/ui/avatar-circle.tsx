import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';

type AvatarCircleProps = {
  /** Diameter in points. */
  size: number;
  /** Signed URL for avatar image. */
  url?: string | null;
  /** Storage path used as stable cache key for expo-image. */
  storagePath?: string | null;
  /** Emoji fallback (shown when no image URL). */
  emoji?: string | null;
  /** Single-character fallback (shown when no emoji). */
  fallbackInitial?: string | null;
};

export function AvatarCircle({
  size,
  url,
  storagePath,
  emoji,
  fallbackInitial,
}: AvatarCircleProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(size), [size]);
  const normalizedInitial = (fallbackInitial ?? '?').trim().charAt(0).toUpperCase();
  const [imageFailed, setImageFailed] = useState(false);
  const hasUsableUrl = Boolean(url) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  return (
    <View style={[styles.circle, { backgroundColor: colors.surfaceAlt }]}>
      {hasUsableUrl ? (
        <ExpoImage
          cachePolicy="memory-disk"
          source={{
            uri: url,
            ...(storagePath ? { cacheKey: storagePath } : {}),
          }}
          style={styles.image}
          contentFit="cover"
          onError={() => setImageFailed(true)}
        />
      ) : emoji ? (
        <Text style={[styles.emoji, { fontSize: size * 0.52 }]}>{emoji}</Text>
      ) : (
        <Text style={[styles.initial, { color: colors.textPrimary, fontSize: size * 0.38 }]}>
          {normalizedInitial}
        </Text>
      )}
    </View>
  );
}

const createStyles = (size: number) =>
  StyleSheet.create({
    circle: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    emoji: {
      textAlign: 'center',
    },
    initial: {
      fontWeight: '600',
      fontFamily: APP_FONT_FAMILY,
      textAlign: 'center',
    },
  });
