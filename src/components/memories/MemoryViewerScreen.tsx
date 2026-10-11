import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image as RNImage,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuth } from '../../hooks/useAuth';
import { usePhotoDraft, type PhotoDraftData } from '../../context/photoDraft';
import { useVideoDraft, type VideoSegmentDraft } from '../../context/videoDraft';
import { configureForPlayback } from '../../lib/audioSession';
import { notifyError } from '../../lib/appNotify';
import { notify } from '../../lib/haptics';
import i18n, { getCurrentLocale } from '../../lib/i18n';
import { runWithFinally } from '../../lib/runWithFinally';
import { saveLocalMediaToGallery } from '../../lib/saveMediaToGalleryAction';
import { paramFirst } from '../../lib/previewRoute';
import { formatMemoryDate, type MemoryEntry } from '../../lib/memories';
import { resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
import {
  deleteMemory,
  exportMemoryToFile,
  listMemories,
  loadMemoryPhotoDataUri,
  loadMemoryThumbnail,
  releaseMemoryFile,
} from '../../services/memoriesStore';

function imageSize(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function MemoryVideo({ uri, label }: { uri: string; label: string }) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = true;
    instance.muted = false;
  });
  useEffect(() => {
    // Opening a memory is an explicit request to watch it, with sound.
    void configureForPlayback().catch(() => undefined).then(() => player.play());
  }, [player]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
      fullscreenOptions={{ enable: false }}
      accessibilityLabel={label}
    />
  );
}

/** A photo the user can pinch to zoom (native UIScrollView zoom), like the Photos app. */
function ZoomablePhoto({ uri, width, height, label }: { uri: string; width: number; height: number; label: string }) {
  return (
    <ScrollView
      style={StyleSheet.absoluteFill}
      contentContainerStyle={{ width, height }}
      minimumZoomScale={1}
      maximumZoomScale={4}
      bouncesZoom
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}>
      <Image
        source={{ uri }}
        style={{ width, height }}
        contentFit="contain"
        cachePolicy="none"
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
      />
    </ScrollView>
  );
}

/**
 * One page of the gallery. Photos (and video posters) load while the page is the current one or
 * a neighbour, so a swipe lands on a ready image; a video is decrypted into Caches only while its
 * page is current and deleted when the user swipes away.
 */
function MemoryPage({
  entry,
  active,
  nearby,
  width,
  height,
  label,
}: {
  entry: MemoryEntry;
  active: boolean;
  nearby: boolean;
  width: number;
  height: number;
  label: string;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const isVideo = entry.mediaType === 'video';
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [posterUri, setPosterUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isVideo || !nearby || photoUri) return;
    let alive = true;
    loadMemoryPhotoDataUri(entry).then(
      (uri) => {
        if (alive) setPhotoUri(uri);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [entry, isVideo, nearby, photoUri]);

  useEffect(() => {
    if (!isVideo || !nearby || posterUri) return;
    let alive = true;
    loadMemoryThumbnail(entry).then(
      (uri) => {
        if (alive) setPosterUri(uri);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [entry, isVideo, nearby, posterUri]);

  useEffect(() => {
    if (!isVideo || !active) return;
    let alive = true;
    let playbackUri: string | null = null;
    exportMemoryToFile(entry, 'play').then(
      (uri) => {
        if (!alive) {
          releaseMemoryFile(uri);
          return;
        }
        playbackUri = uri;
        setVideoUri(uri);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
      setVideoUri(null);
      releaseMemoryFile(playbackUri);
    };
  }, [active, entry, isVideo]);

  const loading = !failed && (isVideo ? active && !videoUri : !photoUri);
  return (
    <View style={{ width, height }}>
      {photoUri ? <ZoomablePhoto uri={photoUri} width={width} height={height} label={label} /> : null}
      {isVideo && posterUri && !videoUri ? (
        <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : null}
      {videoUri ? <MemoryVideo uri={videoUri} label={label} /> : null}
      {loading ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={colors.cameraControlTint} accessibilityLabel={t('common.loading')} />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.cinemaSecondaryLabel }]}>{t('memories.loadFailed')}</Text>
        </View>
      ) : null}
    </View>
  );
}

type ResendDraft =
  | { kind: 'photo'; draft: PhotoDraftData }
  | { kind: 'video'; segment: VideoSegmentDraft };

/** A plaintext copy for the preview editor; the draft owns it from here (old copies are swept). */
async function prepareMemoryResend(entry: MemoryEntry): Promise<ResendDraft> {
  const uri = await exportMemoryToFile(entry, 'resend');
  if (entry.mediaType === 'video') {
    return {
      kind: 'video',
      segment: {
        uri,
        durationMs: Math.max(0, Math.round(entry.durationMs ?? 0)),
        width: entry.width ?? undefined,
        height: entry.height ?? undefined,
      },
    };
  }
  const size = entry.width && entry.height
    ? { width: entry.width, height: entry.height }
    : await imageSize(uri).catch(() => ({ width: undefined, height: undefined }));
  return { kind: 'photo', draft: { uri, width: size.width, height: size.height } };
}

/** Decrypts into Caches only for the Photos import and deletes the copy right after. */
async function saveMemoryToPhotos(entry: MemoryEntry, viewportWidth: number, viewportHeight: number) {
  let uri: string | null = null;
  try {
    uri = await exportMemoryToFile(entry, 'save');
    await saveLocalMediaToGallery({ source: 'viewer', uris: [uri], mediaType: entry.mediaType, viewportWidth, viewportHeight });
  } catch {
    notifyError(i18n.t('media.saveFailed'));
  } finally {
    releaseMemoryFile(uri);
  }
}

/**
 * Full-screen memories gallery: swipe between memories like the Photos app (same order as the
 * grid, newest first), pinch to zoom photos. Plain expo-image / expo-video, no NiX viewer (no view
 * acks, no expiry). Photos stay in memory; a video is decrypted into Caches only while its page is
 * shown and deleted afterwards.
 */
export function MemoryViewerScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const memoryId = paramFirst(params.id);
  const { setDraft } = usePhotoDraft();
  const { setSegments } = useVideoDraft();
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<MemoryEntry>>(null);

  useEffect(() => {
    if (!ownerId || !memoryId) return;
    let active = true;
    listMemories(ownerId).then(
      (all) => {
        if (!active) return;
        const start = all.findIndex((item) => item.id === memoryId);
        if (start < 0) {
          setFailed(true);
          return;
        }
        setIndex(start);
        setEntries(all);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [memoryId, ownerId]);

  const entry = entries?.[index] ?? null;
  const loadingList = !failed && entries === null && Boolean(memoryId);
  const title = entry ? formatMemoryDate(entry.createdAt, getCurrentLocale(), true) : t('memories.title');
  const labelFor = (item: MemoryEntry) => t(item.mediaType === 'video' ? 'memories.video' : 'memories.photo');
  const names = entry?.recipientNames ?? [];

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile/memories');
  };

  const onPageSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    if (next !== index) setIndex(next);
  };

  const resend = () => {
    if (!entry || busy) return;
    setBusy(true);
    void runWithFinally(
      () => prepareMemoryResend(entry).then(
        (next) => {
          if (next.kind === 'photo') {
            setDraft(next.draft);
            router.replace('/preview');
          } else {
            setSegments([next.segment]);
            router.replace({ pathname: '/preview', params: { mode: 'video' } });
          }
        },
        () => {
          notifyError(t('memories.resendFailed'));
        },
      ),
      () => setBusy(false),
    );
  };

  const saveToPhotos = () => {
    if (!entry || busy) return;
    setBusy(true);
    void runWithFinally(() => saveMemoryToPhotos(entry, width, height), () => setBusy(false));
  };

  const confirmDelete = () => {
    if (!entry || !ownerId || !entries) return;
    const removed = entry;
    Alert.alert(t('memories.deleteTitle'), t('memories.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('memories.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteMemory(ownerId, removed.id).then(
            () => {
              notify('success');
              const remaining = entries.filter((item) => item.id !== removed.id);
              if (remaining.length === 0) {
                close();
                return;
              }
              // Like Photos: the next memory slides into place; after the last one, the previous.
              const nextIndex = Math.min(index, remaining.length - 1);
              setEntries(remaining);
              setIndex(nextIndex);
              requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: nextIndex, animated: false }));
            },
            () => notify('error'),
          );
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.cinemaBackground }]}>
      <StatusBar style="light" />
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: colors.cameraControlTint,
          headerTitleStyle: { color: colors.cameraControlTint },
          headerStyle: { backgroundColor: 'transparent' },
          title,
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={resolveAppIconName('close')}
          accessibilityLabel={t('memories.close')}
          onPress={close}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="bottom">
        <Stack.Toolbar.Button
          icon={resolveAppIconName('resend')}
          accessibilityLabel={t('memories.resend')}
          disabled={!entry || busy}
          onPress={resend}
        />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button
          icon={resolveAppIconName('saveToPhotos')}
          accessibilityLabel={t('memories.saveToPhotos')}
          disabled={!entry || busy}
          onPress={saveToPhotos}
        />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button
          icon={resolveAppIconName('trash')}
          accessibilityLabel={t('memories.delete')}
          tintColor={colors.destructive}
          disabled={!entry || busy}
          onPress={confirmDelete}
        />
      </Stack.Toolbar>

      {entries ? (
        <FlatList
          ref={listRef}
          data={entries}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          onMomentumScrollEnd={onPageSettled}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          extraData={index}
          renderItem={({ item, index: itemIndex }) => (
            <MemoryPage
              entry={item}
              active={itemIndex === index}
              nearby={Math.abs(itemIndex - index) <= 1}
              width={width}
              height={height}
              label={labelFor(item)}
            />
          )}
        />
      ) : null}

      {loadingList || busy ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={colors.cameraControlTint} accessibilityLabel={t('common.loading')} />
        </View>
      ) : null}
      {failed || !memoryId ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.cinemaSecondaryLabel }]}>{t('memories.loadFailed')}</Text>
        </View>
      ) : null}
      {names.length > 0 ? (
        <View style={[styles.caption, { top: insets.top + 52 }]} pointerEvents="none">
          <Text
            numberOfLines={2}
            style={[styles.captionText, { color: colors.cinemaSecondaryLabel, textShadowColor: colors.cinemaScrim }]}>
            {t('memories.sentTo', { names: names.join(', ') })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  captionText: {
    ...typography.footnote,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
});
