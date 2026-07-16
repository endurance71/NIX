import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { notifyWarning } from '../lib/appNotify';
import { trackEvent } from '../lib/telemetry';
import {
  disableViewerCaptureProtection,
  enableViewerCaptureProtection,
} from '../lib/viewerCaptureProtection';

export function useViewerCaptureGuard(captureDenied: boolean, paramSenderId: string | undefined) {
  useEffect(() => {
    let screenshotSubscription: { remove: () => void } | null = null;
    let isMounted = true;

    if (!captureDenied) {
      trackEvent('viewer_capture_policy_allow', { sender_id: paramSenderId ?? null });
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

        trackEvent('viewer_capture_block_enabled', { sender_id: paramSenderId ?? null });
        screenshotSubscription = ScreenCapture.addScreenshotListener(() => {
          notifyWarning('Wykryto próbę zrzutu ekranu.', {
            message: 'Na tym NiXie ochrona capture jest aktywna.',
          });
          trackEvent('viewer_capture_attempt', {
            sender_id: paramSenderId ?? null,
          });
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
