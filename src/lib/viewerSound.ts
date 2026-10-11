/**
 * Viewer video sound preference for this app session only (like Instagram): videos start muted
 * until the user turns sound on, then stay unmuted until the app restarts. iOS gives apps no way
 * to read the ring/silent switch, so muted-by-default is how the viewer respects it.
 */
let viewerSoundOn = false;

export function getViewerSoundOn(): boolean {
  return viewerSoundOn;
}

export function setViewerSoundOn(soundOn: boolean): void {
  viewerSoundOn = soundOn;
}
