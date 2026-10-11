import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { VIEWER_VIDEO_PROGRESS_SYNC_SEC } from './viewerVideoProgress';
import { getViewerSoundOn } from './viewerSound';

export function configureViewerVideoPlayer(player: VideoPlayer, loop: boolean) {
  player.loop = loop;
  // Sparse events only correct the UI-thread progress animation (PERF-24).
  player.timeUpdateEventInterval = VIEWER_VIDEO_PROGRESS_SYNC_SEC;
  // Muted by default (respects the silent switch in spirit); 'auto' then mixes with the user's music.
  player.muted = !getViewerSoundOn();
  player.volume = 1;
  player.audioMixingMode = 'auto';
}

/** Detached player for preloading the next slide; the caller owns `release()`. */
export function createViewerVideoPlayer(uri: string, loop: boolean): VideoPlayer {
  const player = createVideoPlayer({ uri });
  configureViewerVideoPlayer(player, loop);
  return player;
}

/** Applies the viewer's sound preference and loop mode to a (possibly preloaded) player. */
export function applyViewerPlayerOptions(player: VideoPlayer, options: { muted: boolean; loop: boolean }) {
  if (player.muted !== options.muted) player.muted = options.muted;
  if (player.loop !== options.loop) player.loop = options.loop;
}

/** Seeks back to the start (left tap zone); false when the player is gone. */
export function restartViewerPlayer(player: VideoPlayer): boolean {
  try {
    player.currentTime = 0;
    return true;
  } catch {
    return false;
  }
}
