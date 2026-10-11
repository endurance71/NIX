import type { VideoPlayer } from 'expo-video';

/** Mutes/unmutes a preview player (a native object, so outside React's immutability rules). */
export function setPreviewPlayerMuted(player: Pick<VideoPlayer, 'muted'>, muted: boolean) {
  player.muted = muted;
}
