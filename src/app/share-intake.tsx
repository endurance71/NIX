import { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Directory, File, Paths } from 'expo-file-system';
import { createVideoPlayer } from 'expo-video';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAuth } from '../hooks/useAuth';
import { usePhotoDraft } from '../context/photoDraft';
import { useVideoDraft } from '../context/videoDraft';
import { notifyError } from '../lib/appNotify';
import {
  parseSharedIntakeParams,
  SHARED_INTAKE_APP_GROUP,
  SHARED_INTAKE_FOLDER,
} from '../lib/sharedIntake';
import { VIDEO_TOTAL_MAX_DURATION_MS } from '../lib/videoRecordingLimits';

/** Moves the shared file out of the App Group container into this app's cache. */
async function takeSharedFile(fileName: string): Promise<File | null> {
  const container = Paths.appleSharedContainers[SHARED_INTAKE_APP_GROUP];
  if (!container) return null;
  const source = new File(container, SHARED_INTAKE_FOLDER, fileName);
  if (!source.exists) return null;
  const folder = new Directory(Paths.cache, 'shared-intake');
  if (!folder.exists) folder.create({ intermediates: true });
  const destination = new File(folder, fileName);
  if (destination.exists) destination.delete();
  // `move` is async since SDK 58: the file is not at `destination` until it resolves.
  await source.move(destination);
  return destination;
}

function imageSize(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/** Duration and size of a local clip, read by a throwaway player. */
function probeVideo(uri: string) {
  return new Promise<{ durationMs: number; width?: number; height?: number }>((resolve, reject) => {
    const player = createVideoPlayer({ uri });
    let size: { width?: number; height?: number } = {};
    const done = (result: { durationMs: number } | Error) => {
      clearTimeout(timer);
      sourceLoad.remove();
      status.remove();
      player.release();
      if (result instanceof Error) reject(result);
      else resolve({ ...result, ...size });
    };
    const timer = setTimeout(() => done(new Error('video probe timeout')), 8000);
    const sourceLoad = player.addListener('sourceLoad', ({ availableVideoTracks }) => {
      const track = availableVideoTracks[0]?.size;
      if (track) size = { width: track.width, height: track.height };
    });
    const status = player.addListener('statusChange', ({ status: next }) => {
      if (next === 'readyToPlay') done({ durationMs: Math.round(player.duration * 1000) });
      if (next === 'error') done(new Error('video probe failed'));
    });
  });
}

// Files already taken in this app session: iOS / the router can deliver the same share link again
// when the app returns to the foreground, which must not show an error.
const takenFiles = new Set<string>();

/**
 * Leaves the intake screen without a trace. Not `router.back()`: a deep link can land here as
 * the only screen of its stack, where `canGoBack()` is true but GO_BACK is not handled.
 */
function leaveQuietly() {
  router.replace('/(tabs)');
}

/** Entry from the share sheet: opens the shared photo or video in the preview editor. */
export default function ShareIntakeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { user, loading } = useAuth();
  const params = useLocalSearchParams<{ file?: string; kind?: string }>();
  const { setDraft: setPhotoDraft } = usePhotoDraft();
  const { setSegments } = useVideoDraft();
  const started = useRef(false);

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    const request = parseSharedIntakeParams(params);
    // Taken earlier (this session, or a previous one: the file already sits in our cache).
    const alreadyTaken =
      request &&
      (takenFiles.has(request.fileName) ||
        (!new File(Paths.appleSharedContainers[SHARED_INTAKE_APP_GROUP] ?? Paths.cache, SHARED_INTAKE_FOLDER, request.fileName).exists &&
          new File(Paths.cache, 'shared-intake', request.fileName).exists));
    if (alreadyTaken) {
      leaveQuietly();
      return;
    }
    const fail = (message: string) => {
      notifyError(message);
      router.replace('/(tabs)');
    };
    void (async () => {
      // Claimed before the (async) move, so a second run of this effect cannot take it again.
      if (request) takenFiles.add(request.fileName);
      const file = request ? await takeSharedFile(request.fileName).catch(() => null) : null;
      if (!request || !file) return fail(t('shareIntake.missing'));
      try {
        if (request.kind === 'photo') {
          const size = await imageSize(file.uri);
          setPhotoDraft({ uri: file.uri, width: size.width, height: size.height });
          router.replace('/preview');
          return;
        }
        const video = await probeVideo(file.uri);
        if (video.durationMs > VIDEO_TOTAL_MAX_DURATION_MS + 500) return fail(t('camera.videoTooLong'));
        setSegments([{ uri: file.uri, durationMs: video.durationMs, width: video.width, height: video.height }]);
        router.replace({ pathname: '/preview', params: { mode: 'video' } });
      } catch {
        fail(t('shareIntake.failed'));
      }
    })();
  }, [loading, params, setPhotoDraft, setSegments, t, user]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cinemaBackground }}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <ActivityIndicator color={colors.cameraControlTint} accessibilityLabel={t('shareIntake.loading')} />
    </View>
  );
}
