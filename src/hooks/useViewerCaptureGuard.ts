import { useEffect, useRef } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import i18n from '../lib/i18n';
import { notifyWarning } from '../lib/appNotify';
import { trackEvent } from '../lib/telemetry';
import {
  disableViewerCaptureProtection,
  enableViewerCaptureProtection,
} from '../lib/viewerCaptureProtection';
import { reportCaptureAttempt } from '../services/captureAttemptService';

export function useViewerCaptureGuard(captureDenied: boolean | null, paramSenderId: string | undefined, paramNixId: string | undefined) {
  const currentNixIdRef = useRef(paramNixId);
  useEffect(() => {
    currentNixIdRef.current = paramNixId;
  }, [paramNixId]);

  useEffect(() => {
    let screenshotSubscription: { remove: () => void } | null = null;
    let isMounted = true;

    if (captureDenied === null) return;

    if (!captureDenied) {
      trackEvent('viewer_capture_policy_allow');
      void disableViewerCaptureProtection().catch((error) => {
        console.warn('Could not disable screen capture guard in viewer', error);
      });
      return () => {
        isMounted = false;
      };
    }

    void enableViewerCaptureProtection()
      .then(() => {
        if (!isMounted) return;

        trackEvent('viewer_capture_block_enabled');
        screenshotSubscription = ScreenCapture.addScreenshotListener(() => {
          notifyWarning(i18n.t('notify.captureAttempt'), {
            message: i18n.t('notify.captureProtection'),
          });
          trackEvent('viewer_capture_attempt');
          if (currentNixIdRef.current) {
            void reportCaptureAttempt(currentNixIdRef.current);
          }
        });
      })
      .catch((error) => {
        console.warn('Could not enable screen capture guard in viewer', error);
      });

    return () => {
      isMounted = false;
      screenshotSubscription?.remove();
      void disableViewerCaptureProtection().catch((error) => {
        console.warn('Could not disable screen capture guard in viewer', error);
      });
    };
  }, [captureDenied, paramSenderId]);
}
