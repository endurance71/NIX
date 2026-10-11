import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMotionEnabled } from '../../theme/motion';
import { typography } from '../../theme/typography';
import { AppIcon } from '../ui/app-icon';
import { formatMemoryDuration, type MemoryEntry } from '../../lib/memories';
import { loadMemoryThumbnail } from '../../services/memoriesStore';

type MemoryGridCellProps = {
  entry: MemoryEntry;
  size: number;
  accessibilityLabel: string;
};

/**
 * One square of the album grid: the decrypted thumbnail lives in memory only (data URI). Opening
 * it zooms the square into the viewer and back (iOS 18+ zoom transition, like Photos).
 */
export function MemoryGridCell({ entry, size, accessibilityLabel }: MemoryGridCellProps) {
  const { colors } = useAppTheme();
  const motionEnabled = useMotionEnabled();
  // Keyed by id: FlashList recycles this component for another memory.
  const [thumbnail, setThumbnail] = useState<{ id: string; uri: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    void loadMemoryThumbnail(entry)
      .catch(() => null)
      .then((uri) => {
        if (active) setThumbnail({ id: entry.id, uri });
      });
    return () => {
      active = false;
    };
  }, [entry]);

  const uri = thumbnail?.id === entry.id ? thumbnail.uri : null;
  const duration = entry.mediaType === 'video' ? formatMemoryDuration(entry.durationMs) : null;

  return (
    <Link href={{ pathname: '/memory-viewer', params: { id: entry.id } }} asChild>
      <Link.AppleZoom>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          // Link's Slot takes one flat style object (no arrays, no pressed-state function).
          style={StyleSheet.flatten([
            styles.cell,
            { width: size, height: size, backgroundColor: colors.secondarySystemBackground },
          ])}>
          {uri ? (
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              // Decrypted pixels must never reach expo-image's disk cache.
              cachePolicy="none"
              transition={motionEnabled ? 120 : 0}
              accessible={false}
            />
          ) : (
            <View style={styles.placeholder}>
              <AppIcon
                name={entry.mediaType === 'video' ? 'statusVideoOpened' : 'statusPhotoOpened'}
                size={20}
                color={colors.tertiaryLabel}
              />
            </View>
          )}
          {entry.mediaType === 'video' ? (
            <View style={styles.videoBadge} pointerEvents="none">
              <AppIcon name="playFill" size={11} color={colors.cameraControlTint} />
              {duration ? (
                <Text
                  style={[
                    styles.duration,
                    { color: colors.cameraControlTint, textShadowColor: colors.cinemaScrim },
                  ]}>
                  {duration}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Link.AppleZoom>
    </Link>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 6,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  duration: {
    ...typography.caption,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
});
