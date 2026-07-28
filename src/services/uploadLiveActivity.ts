import { after, type LiveActivity } from 'expo-widgets';

import { uploadFeatures } from '../config/uploadFeatures';
import UploadStatusActivity, {
  type UploadStatusActivityProps,
} from '../widgets/UploadStatusActivity';

let activity: LiveActivity<UploadStatusActivityProps> | null = null;
let lastUpdateAt = 0;
let lastProps: UploadStatusActivityProps | null = null;
let pendingProps: UploadStatusActivityProps | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;

const MIN_UPDATE_INTERVAL_MS = 1_000;
const MIN_PROGRESS_DELTA = 0.01;

function available() {
  return uploadFeatures.liveActivities && process.env.NODE_ENV !== 'test';
}

function getExistingActivity() {
  if (activity) return activity;
  try {
    activity = UploadStatusActivity.getInstances()[0] ?? null;
  } catch {
    activity = null;
  }
  return activity;
}

export function startUploadLiveActivity(props: UploadStatusActivityProps) {
  if (!available()) return;
  try {
    const existing = getExistingActivity();
    if (existing) {
      void existing.update(props);
      lastUpdateAt = Date.now();
      lastProps = props;
      return;
    }
    activity = UploadStatusActivity.start(props, 'nix://inbox');
    lastUpdateAt = Date.now();
    lastProps = props;
  } catch (error) {
    console.warn('Upload Live Activity could not be started', error);
  }
}

function hasMeaningfulChange(props: UploadStatusActivityProps) {
  return !lastProps
    || props.phase !== lastProps.phase
    || props.remainingCount !== lastProps.remainingCount
    || Math.abs(props.progress - lastProps.progress) >= MIN_PROGRESS_DELTA;
}

function flushPendingUpdate() {
  updateTimer = null;
  const props = pendingProps;
  pendingProps = null;
  if (!props || !hasMeaningfulChange(props)) return;
  const existing = getExistingActivity();
  if (!existing) return;
  void existing.update(props);
  lastUpdateAt = Date.now();
  lastProps = props;
}

export function updateUploadLiveActivity(props: UploadStatusActivityProps) {
  if (!available()) return;
  try {
    const existing = getExistingActivity();
    if (!existing || !hasMeaningfulChange(props)) return;
    const elapsed = Date.now() - lastUpdateAt;
    if (elapsed >= MIN_UPDATE_INTERVAL_MS) {
      pendingProps = props;
      flushPendingUpdate();
      return;
    }
    pendingProps = props;
    if (!updateTimer) {
      updateTimer = setTimeout(flushPendingUpdate, MIN_UPDATE_INTERVAL_MS - elapsed);
    }
  } catch (error) {
    console.warn('Upload Live Activity could not be updated', error);
  }
}

export function endUploadLiveActivity(
  props: UploadStatusActivityProps,
  mode: 'success' | 'failure' | 'immediate'
) {
  if (!available()) return;
  try {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = null;
    pendingProps = null;
    const existing = getExistingActivity();
    if (!existing) return;
    const policy = mode === 'immediate'
      ? 'immediate' as const
      : after(new Date(Date.now() + (mode === 'success' ? 30_000 : 60 * 60 * 1000)));
    void existing.end(policy, props);
    activity = null;
    lastUpdateAt = 0;
    lastProps = null;
  } catch (error) {
    console.warn('Upload Live Activity could not be ended', error);
  }
}
