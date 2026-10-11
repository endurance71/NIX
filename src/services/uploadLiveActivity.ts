import { after, type LiveActivity } from 'expo-widgets';
import { AppState } from 'react-native';

import { uploadFeatures } from '../config/uploadFeatures';
import type { UploadLiveActivityNativeState } from '../lib/uploadLiveActivityPresentation';
import NativeBackgroundUploader from '../../modules/nix-background-uploader/src/NixBackgroundUploaderModule';
import UploadStatusActivity, {
  type UploadStatusActivityProps,
} from '../widgets/UploadStatusActivity';

/**
 * SEND-2 — one writer per moment:
 * - app in front (`active` / `inactive`): JS writes the activity directly via expo-widgets;
 *   the native uploader only receives the queue view (`reportLiveActivityState`), no writes;
 * - app in background: JS may be suspended at any time, so every write is delegated to the
 *   native uploader, which publishes the same banded model merged with live URLSession bytes.
 * Ending the activity stays with JS (it alone knows compression and moderation are done);
 * native ends it only when the last reported queue view has no pending job at all.
 */

let activity: LiveActivity<UploadStatusActivityProps> | null = null;
let lastUpdateAt = 0;
let lastProps: UploadStatusActivityProps | null = null;
let pendingProps: UploadStatusActivityProps | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;

let lastReportKey = '';
let lastReportJson = '';
let lastReportAt = 0;
let pendingReport: UploadLiveActivityNativeState | null = null;
let reportTimer: ReturnType<typeof setTimeout> | null = null;

const MIN_UPDATE_INTERVAL_MS = 1_000;
const MIN_PROGRESS_DELTA = 0.01;
const MIN_REPORT_INTERVAL_MS = 1_000;

function available() {
  return uploadFeatures.liveActivities && process.env.NODE_ENV !== 'test';
}

function nativeOwnsActivity() {
  return Boolean(NativeBackgroundUploader) && AppState.currentState === 'background';
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

function remember(props: UploadStatusActivityProps) {
  lastUpdateAt = Date.now();
  lastProps = props;
}

function reportKey(state: UploadLiveActivityNativeState) {
  return `${state.locale}|${state.jobs.map((job) => `${job.id}:${job.state}`).join(',')}`;
}

function sendReport(state: UploadLiveActivityNativeState) {
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = null;
  pendingReport = null;
  const json = JSON.stringify({ ...state, updatedAt: 0 });
  if (json === lastReportJson) return;
  if (!NativeBackgroundUploader || typeof NativeBackgroundUploader.reportLiveActivityState !== 'function') {
    return;
  }
  lastReportJson = json;
  lastReportKey = reportKey(state);
  lastReportAt = Date.now();
  void NativeBackgroundUploader.reportLiveActivityState(JSON.stringify(state)).catch((error: unknown) => {
    // Retry the same view on the next change instead of trusting a report that never landed.
    lastReportJson = '';
    console.warn('Upload Live Activity queue state could not be reported', error);
  });
}

function flushPendingReport() {
  if (pendingReport) sendReport(pendingReport);
}

/**
 * Keeps the native background writer informed about the whole queue. Phase / job-set / locale
 * changes go out immediately; progress-only changes at most once per second.
 */
export function reportUploadLiveActivityState(state: UploadLiveActivityNativeState) {
  if (!available() || !NativeBackgroundUploader) return;
  if (reportKey(state) !== lastReportKey) {
    sendReport(state);
    return;
  }
  pendingReport = state;
  const elapsed = Date.now() - lastReportAt;
  if (elapsed >= MIN_REPORT_INTERVAL_MS) {
    sendReport(state);
    return;
  }
  if (!reportTimer) {
    reportTimer = setTimeout(flushPendingReport, MIN_REPORT_INTERVAL_MS - elapsed);
  }
}

function syncNativeLiveActivity(props: UploadStatusActivityProps) {
  if (!NativeBackgroundUploader) return;
  // The native writer merges with the queue view — make sure it has the latest one first.
  flushPendingReport();
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

function delegateToNative(props: UploadStatusActivityProps) {
  remember(props);
  syncNativeLiveActivity(props);
}

function updateExisting(
  existing: LiveActivity<UploadStatusActivityProps>,
  props: UploadStatusActivityProps
) {
  remember(props);
  void existing.update(props).catch(() => {
    // Ended by iOS, the user or the native background writer: start fresh next time.
    if (activity === existing) activity = null;
  });
}

export function startUploadLiveActivity(props: UploadStatusActivityProps) {
  if (!available()) return;
  if (nativeOwnsActivity()) {
    delegateToNative(props);
    return;
  }
  try {
    // Re-query instead of trusting the cached handle: an activity ended while the app was in
    // the background is no longer listed and must not swallow this start.
    activity = null;
    const existing = getExistingActivity();
    if (existing) {
      updateExisting(existing, props);
      logDevelopmentStatus(`updated:${props.phase}`);
      return;
    }
    activity = UploadStatusActivity.start(props, 'nix://inbox');
    remember(props);
    logDevelopmentStatus(`started:${props.phase}`);
  } catch (error) {
    console.warn('Upload Live Activity could not be started', error);
    // The JS start did not happen — native start is the only write.
    delegateToNative(props);
  }
}

function hasMeaningfulChange(props: UploadStatusActivityProps) {
  return !lastProps
    || props.phase !== lastProps.phase
    || props.remainingCount !== lastProps.remainingCount
    || props.locale !== lastProps.locale
    || Math.abs(props.progress - lastProps.progress) >= MIN_PROGRESS_DELTA;
}

function publishUpdate(props: UploadStatusActivityProps) {
  if (nativeOwnsActivity()) {
    delegateToNative(props);
    return;
  }
  const existing = getExistingActivity();
  if (existing) updateExisting(existing, props);
}

function flushPendingUpdate() {
  updateTimer = null;
  const props = pendingProps;
  pendingProps = null;
  if (!props || !hasMeaningfulChange(props)) return;
  publishUpdate(props);
}

export function updateUploadLiveActivity(props: UploadStatusActivityProps) {
  if (!available()) return;
  try {
    if (!hasMeaningfulChange(props)) return;
    if (!nativeOwnsActivity() && !getExistingActivity()) return;
    const elapsed = Date.now() - lastUpdateAt;
    pendingProps = props;
    if (elapsed >= MIN_UPDATE_INTERVAL_MS) {
      flushPendingUpdate();
      return;
    }
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
    void existing.end(policy, props).catch(() => undefined);
    activity = null;
    lastUpdateAt = 0;
    lastProps = null;
  } catch (error) {
    console.warn('Upload Live Activity could not be ended', error);
  }
}
