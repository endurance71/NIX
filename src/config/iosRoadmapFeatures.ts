const internalRoadmap =
  process.env.EXPO_PUBLIC_INTERNAL_TESTFLIGHT_ROADMAP_ENABLED === 'true';

export function resolveRoadmapFeature(value: string | undefined) {
  if (value === 'false') return false;
  return internalRoadmap || value === 'true';
}

/**
 * User-facing roadmap surfaces stay off in production until their matching
 * backend rollout has been verified in the internal TestFlight cohort.
 */
export const iosRoadmapFeatures = {
  analytics: resolveRoadmapFeature(process.env.EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED),
  activation: internalRoadmap,
  shareInvites: resolveRoadmapFeature(process.env.EXPO_PUBLIC_SHARE_INVITES_ENABLED),
  communicationControls: resolveRoadmapFeature(
    process.env.EXPO_PUBLIC_COMMUNICATION_CONTROLS_ENABLED
  ),
  accountData: resolveRoadmapFeature(process.env.EXPO_PUBLIC_ACCOUNT_DATA_TOOLS_ENABLED),
} as const;
