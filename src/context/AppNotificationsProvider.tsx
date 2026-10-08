import { useLayoutEffect, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../hooks/useAuth';
import { appNotificationQueue } from '../lib/notificationQueue';
import { NotificationPresentation } from '../components/notifications/NotificationPresentation';
import { useNotificationAccessibility } from '../components/notifications/useNotificationAccessibility';

export function AppNotificationsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(appNotificationQueue.subscribe, appNotificationQueue.getSnapshot);
  const { ready, reducedMotion, screenReader } = useNotificationAccessibility();

  useLayoutEffect(() => {
    appNotificationQueue.setOwner(user?.id ?? null);
  }, [user?.id]);

  useLayoutEffect(() => {
    appNotificationQueue.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => appNotificationQueue.setActive(state === 'active'));
    return () => {
      subscription.remove();
      appNotificationQueue.setActive(false);
    };
  }, []);

  return (
    <>
      {children}
      {ready && snapshot.notification ? (
        <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
          <GestureHandlerRootView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <NotificationPresentation key={snapshot.generation} snapshot={snapshot}
              reducedMotion={reducedMotion} screenReader={screenReader} />
          </GestureHandlerRootView>
        </FullWindowOverlay>
      ) : null}
    </>
  );
}
