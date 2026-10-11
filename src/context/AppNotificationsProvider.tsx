import { useLayoutEffect, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../hooks/useAuth';
import { appNotificationQueue } from '../lib/notificationQueue';
import { installNotificationFeedback } from '../lib/notificationFeedback';
import { NotificationPresentation } from '../components/notifications/NotificationPresentation';
import { useNotificationAccessibility } from '../components/notifications/useNotificationAccessibility';

export function AppNotificationsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(appNotificationQueue.subscribe, appNotificationQueue.getSnapshot);
  const { ready, reducedMotion, screenReader } = useNotificationAccessibility();

  useLayoutEffect(() => {
    appNotificationQueue.setOwner(user?.id ?? null);
  }, [user?.id]);

  // Haptics at enqueue time (the cause), not when the reveal animation ends.
  useLayoutEffect(() => installNotificationFeedback((message) => {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  }), []);

  // Only the background clears the queue (privacy). `inactive` — Control Center, Face ID, a
  // permission prompt — used to wipe a visible error and drop results arriving meanwhile.
  useLayoutEffect(() => {
    appNotificationQueue.setActive(AppState.currentState !== 'background');
    const subscription = AppState.addEventListener('change', (state) => appNotificationQueue.setActive(state !== 'background'));
    return () => {
      subscription.remove();
      // Silent teardown: emitting here would schedule a store update in the middle of the
      // unmount commit (see NotificationQueue.detach).
      appNotificationQueue.detach();
    };
  }, []);

  // NOTIF-6: patches/react-native-screens+4.26.2.patch hosts the RNSFullWindowOverlay container in
  // its own pass-through, never-key UIWindow at `UIWindowLevelAlert + 1`, so sheets, pickers and share
  // sheets presented while a card is visible stay below it. Keying the overlay by generation is kept
  // for binaries built before that patch (OTA JS on an older native build): there a later
  // presentation still covers the current card, but each new card re-attaches on top.
  return (
    <>
      {children}
      {ready && snapshot.notification ? (
        <FullWindowOverlay key={snapshot.generation} unstable_accessibilityContainerViewIsModal={false}>
          <GestureHandlerRootView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <NotificationPresentation snapshot={snapshot}
              reducedMotion={reducedMotion} screenReader={screenReader} />
          </GestureHandlerRootView>
        </FullWindowOverlay>
      ) : null}
    </>
  );
}
