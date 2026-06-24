import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { notifyWarning } from '../lib/appNotify';
import { trackEvent } from '../lib/telemetry';

const VIEWER_CAPTURE_GUARD_KEY = 'viewer-capture-guard';

export function useViewerCaptureGuard(captureDenied: boolean, paramSenderId: string | undefined) {
  useEffect(() => {
    let screenshotSubscription: { remove: () => void } | null = null;
    let isMounted = true;

    if (!captureDenied) {
      trackEvent('viewer_capture_policy_allow', { sender_id: paramSenderId ?? null });
      return () => {};
    }

    void (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync(VIEWER_CAPTURE_GUARD_KEY);
        await ScreenCapture.enableAppSwitcherProtectionAsync(0.72);
        trackEvent('viewer_capture_block_enabled', { sender_id: paramSenderId ?? null });
      } catch (error) {
        console.warn('Could not enable screen capture guard in viewer', error);
      }

      if (!isMounted) return;

      screenshotSubscription = ScreenCapture.addScreenshotListener(() => {
        notifyWarning('Wykryto próbę zrzutu ekranu.', {
          message: 'Na tym NiXie ochrona capture jest aktywna.',
        });
        trackEvent('viewer_capture_attempt', {
          sender_id: paramSenderId ?? null,
        });
      });
    })();

    return () => {
      isMounted = false;
      screenshotSubscription?.remove();
      void ScreenCapture.allowScreenCaptureAsync(VIEWER_CAPTURE_GUARD_KEY).catch(() => {});
      void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, [captureDenied, paramSenderId]);
}
