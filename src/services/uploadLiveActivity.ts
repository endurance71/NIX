import { after, type LiveActivity } from 'expo-widgets';

import { uploadFeatures } from '../config/uploadFeatures';
import NativeBackgroundUploader from '../../modules/nix-background-uploader/src/NixBackgroundUploaderModule';
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

function logDevelopmentStatus(action: string) {
  if (!__DEV__) return;
  let activeCount = 0;
  try {
    activeCount = UploadStatusActivity.getInstances().length;
  } catch {
    // The warning from the caller contains the actionable native error.
  }
  console.info(`[UploadLiveActivity] ${action}`, { activeCount });
}

function syncNativeLiveActivity(props: UploadStatusActivityProps) {
  if (!NativeBackgroundUploader) return;
  void NativeBackgroundUploader.syncLiveActivity(JSON.stringify(props)).then(
    (status) => {
      if (__DEV__) {
        console.info('[UploadLiveActivity] native sync', {
          phase: props.phase,
          ...status,
        });
      }
    },
    (error) => {
      console.warn('Native Upload Live Activity could not be synchronized', error);
    }
  );
}

export function startUploadLiveActivity(props: UploadStatusActivityProps) {
  if (!available()) return;
  try {
    const existing = getExistingActivity();
    if (existing) {
      void existing.update(props);
      lastUpdateAt = Date.now();
      lastProps = props;
      logDevelopmentStatus(`updated:${props.phase}`);
      syncNativeLiveActivity(props);
      return;
    }
    activity = UploadStatusActivity.start(props, 'nix://inbox');
    lastUpdateAt = Date.now();
    lastProps = props;
    logDevelopmentStatus(`started:${props.phase}`);
    syncNativeLiveActivity(props);
  } catch (error) {
    console.warn('Upload Live Activity could not be started', error);
    syncNativeLiveActivity(props);
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
      syncNativeLiveActivity(props);
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
  mode: 'success' | 'immediate'
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
      : after(new Date(Date.now() + 30_000));
    void existing.end(policy, props);
    activity = null;
    lastUpdateAt = 0;
    lastProps = null;
  } catch (error) {
    console.warn('Upload Live Activity could not be ended', error);
  }
}
