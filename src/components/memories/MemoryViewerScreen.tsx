import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image as RNImage, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  releaseMemoryFile,
} from '../../services/memoriesStore';

type ViewerState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; entry: MemoryEntry; photoUri: string | null; videoUri: string | null };

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

function MemoryViewerContent({
  state,
  status,
  busy,
  label,
  captionTop,
}: {
  state: ViewerState;
  status: ViewerState['status'];
  busy: boolean;
  label: string;
  captionTop: number;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const ready = state.status === 'ready' ? state : null;
  const names = ready?.entry.recipientNames ?? [];
  return (
    <>
      {ready?.photoUri ? (
        <Image
          source={{ uri: ready.photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="none"
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
        />
      ) : null}
      {ready?.videoUri ? <MemoryVideo uri={ready.videoUri} label={label} /> : null}
      {status === 'loading' || busy ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={colors.cameraControlTint} accessibilityLabel={t('common.loading')} />
        </View>
      ) : null}
      {status === 'failed' ? (
        <View style={styles.center}>
          <Text style={[styles.message, { color: colors.cinemaSecondaryLabel }]}>{t('memories.loadFailed')}</Text>
        </View>
      ) : null}
      {names.length > 0 ? (
        <View style={[styles.caption, { top: captionTop }]} pointerEvents="none">
          <Text
            numberOfLines={2}
            style={[styles.captionText, { color: colors.cinemaSecondaryLabel, textShadowColor: colors.cinemaScrim }]}>
            {t('memories.sentTo', { names: names.join(', ') })}
          </Text>
        </View>
      ) : null}
    </>
  );
}

type LoadedMemory = { entry: MemoryEntry; photoUri: string | null; videoUri: string | null };

async function loadMemoryForViewer(ownerId: string, memoryId: string): Promise<LoadedMemory> {
  const entry = (await listMemories(ownerId)).find((item) => item.id === memoryId);
  if (!entry) throw new Error('Memory not found');
  if (entry.mediaType === 'image') return { entry, photoUri: await loadMemoryPhotoDataUri(entry), videoUri: null };
  return { entry, photoUri: null, videoUri: await exportMemoryToFile(entry, 'play') };
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
 * Full-screen memory: plain expo-image / expo-video, no NiX viewer (no view acks, no expiry).
 * Photos stay in memory; a video is decrypted into Caches for playback and deleted on close.
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
  const [state, setState] = useState<ViewerState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ownerId || !memoryId) return;
    let active = true;
    let playbackUri: string | null = null;
    loadMemoryForViewer(ownerId, memoryId).then(
      (loaded) => {
        if (!active) {
          releaseMemoryFile(loaded.videoUri);
          return;
        }
        playbackUri = loaded.videoUri;
        setState({ status: 'ready', ...loaded });
      },
      () => {
        if (active) setState({ status: 'failed' });
      },
    );
    return () => {
      active = false;
      releaseMemoryFile(playbackUri);
    };
  }, [memoryId, ownerId]);

  // A missing id (stale link) can never load.
  const status = memoryId ? state.status : 'failed';
  const entry = state.status === 'ready' ? state.entry : null;
  const title = entry ? formatMemoryDate(entry.createdAt, getCurrentLocale(), true) : t('memories.title');
  const mediaLabel = entry ? t(entry.mediaType === 'video' ? 'memories.video' : 'memories.photo') : '';

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile/memories');
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
    if (!entry || !ownerId) return;
    Alert.alert(t('memories.deleteTitle'), t('memories.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('memories.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteMemory(ownerId, entry.id).then(
            () => {
              notify('success');
              close();
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

      <MemoryViewerContent state={state} status={status} busy={busy} label={mediaLabel} captionTop={insets.top + 52} />
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
