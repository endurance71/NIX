function enabledByDefault(value: string | undefined) {
  return value !== 'false';
}

export const uploadFeatures = {
  durableQueue: enabledByDefault(process.env.EXPO_PUBLIC_DURABLE_UPLOAD_QUEUE_ENABLED),
  sharedAssets: enabledByDefault(process.env.EXPO_PUBLIC_SHARED_MEDIA_ASSETS_ENABLED),
  nativeBackgroundUpload: enabledByDefault(process.env.EXPO_PUBLIC_BACKGROUND_UPLOAD_ENABLED),
  liveActivities: enabledByDefault(process.env.EXPO_PUBLIC_UPLOAD_LIVE_ACTIVITY_ENABLED),
  hevcCapture: process.env.EXPO_PUBLIC_HEVC_CAPTURE_ENABLED === 'true',
} as const;
