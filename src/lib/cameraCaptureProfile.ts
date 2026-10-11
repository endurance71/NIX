export const CAMERA_CAPTURE_PROFILE = {
  pictureSize: '1920x1080',
  // Same 1920x1080 session preset as stills: switching presets when a recording starts
  // reconfigured the capture session and blanked the preview.
  videoQuality: '1080p',
  videoStabilizationMode: 'off',
} as const;

export const VIDEO_RECORDING_BITRATE = 1_800_000;
