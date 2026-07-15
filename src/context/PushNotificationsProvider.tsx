import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PushNotificationsContext, type PushNotificationUiState } from './pushNotifications';
import {
  disableCurrentPushDevice,
  getInstallationId,
  getLocalPushDesired,
  getPushDeviceState,
  getPushPermissionState,
  markPushPromptOffered,
  openSystemNotificationSettings,
  registerCurrentPushDevice,
  requestPushPermission,
  setLocalPushDesired,
  subscribeToAppForeground,
  wasPushPromptOffered,
} from '../services/pushNotificationService';
import { parsePushNotificationData, routeForPushNotification } from '../lib/pushNotificationPayload';
import { queryKeys } from '../lib/queryKeys';
import { notifyError } from '../lib/appNotify';
import { trackEvent } from '../lib/telemetry';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function runWithBusyState(
  setBusy: Dispatch<SetStateAction<boolean>>,
  action: () => Promise<void>
) {
  setBusy(true);
  try {
    await action();
  } finally {
    setBusy(false);
  }
}

async function refreshPushNotificationState(
  userId: string,
  setState: Dispatch<SetStateAction<PushNotificationUiState>>
) {
  try {
    const installationId = await getInstallationId();
    const [permission, remote, desired] = await Promise.all([
      getPushPermissionState(),
      getPushDeviceState(installationId),
      getLocalPushDesired(userId),
    ]);

    if (permission === 'denied') {
      if (remote.enabled) {
        await disableCurrentPushDevice(userId, 'system_permission_revoked');
        await setLocalPushDesired(userId, desired);
      }
      setState('denied');
      return;
    }
    if (permission === 'unavailable') {
      setState('unavailable');
      return;
    }
    if (permission === 'granted' && desired && !remote.enabled) {
      await registerCurrentPushDevice(userId);
      setState('enabled');
      return;
    }
    if (permission === 'granted' && remote.enabled) {
      if (!desired) await setLocalPushDesired(userId, true);
      setState('enabled');
      return;
    }
    setState('disabled');
  } catch (error) {
    console.warn('Push notification state refresh failed', error);
    setState('error');
  }
}

async function processPushNotificationResponse({
  response,
  canNavigate,
  queryClient,
  handledResponses,
  pendingResponse,
}: {
  response: Notifications.NotificationResponse;
  canNavigate: boolean;
  queryClient: QueryClient;
  handledResponses: { current: Set<string> };
  pendingResponse: { current: Notifications.NotificationResponse | null };
}) {
  const identifier = response.notification.request.identifier;
  if (handledResponses.current.has(identifier)) return;
  if (!canNavigate) {
    pendingResponse.current = response;
    return;
  }
  const data = parsePushNotificationData(response.notification.request.content.data);
  if (!data) return;
  handledResponses.current.add(identifier);
  if (data.type === 'friend_accepted') {
    await queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
  } else {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
    ]);
  }
  trackEvent('push_notification_opened', { type: data.type });
  router.push(routeForPushNotification(data));
  await Notifications.clearLastNotificationResponseAsync();
}

export function PushNotificationsProvider({
  userId,
  canNavigate,
  children,
}: {
  userId: string;
  canNavigate: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PushNotificationUiState>('loading');
  const [busy, setBusy] = useState(false);
  const handledResponses = useRef<Set<string>>(new Set());
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);

  const refresh = () => refreshPushNotificationState(userId, setState);

  const showSettingsAlert = () => {
    Alert.alert(t('push.permissionDeniedTitle'), t('push.permissionDeniedBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('push.openSettings'), onPress: () => void openSystemNotificationSettings() },
    ]);
  };

  const enable = async () => {
    if (busy) return;
    await runWithBusyState(setBusy, async () => {
      try {
        const permission = await requestPushPermission();
        trackEvent('push_permission_result', { status: permission });
        if (permission === 'denied') {
          setState('denied');
          showSettingsAlert();
          return;
        }
        if (permission !== 'granted') {
          setState('unavailable');
          notifyError(t('push.enableFailed'));
          return;
        }
        await registerCurrentPushDevice(userId);
        setState('enabled');
        trackEvent('push_device_toggle', { enabled: true });
      } catch (error) {
        console.warn('Push notification enable failed', error);
        notifyError(t('push.enableFailed'), { message: t('push.tryAgain') });
        await refresh();
      }
    });
  };

  const disable = async () => {
    if (busy) return;
    await runWithBusyState(setBusy, async () => {
      try {
        await disableCurrentPushDevice(userId, 'user_disabled');
        setState('disabled');
        trackEvent('push_device_toggle', { enabled: false });
      } catch (error) {
        console.warn('Push notification disable failed', error);
        notifyError(t('push.disableFailed'), { message: t('push.tryAgain') });
        await refresh();
      }
    });
  };

  const offerAfterSuccessfulSend = async () => {
    if (state === 'enabled' || state === 'denied' || busy) return;
    if (await wasPushPromptOffered(userId)) return;
    await markPushPromptOffered(userId);
    trackEvent('push_rationale_shown');
    Alert.alert(t('push.rationaleTitle'), t('push.rationaleBody'), [
      { text: t('push.notNow'), style: 'cancel' },
      { text: t('push.enableAction'), onPress: () => void enable() },
    ]);
  };

  useEffect(() => {
    const initialRefresh = setTimeout(
      () => void refreshPushNotificationState(userId, setState),
      0
    );
    const unsubscribe = subscribeToAppForeground(
      () => void refreshPushNotificationState(userId, setState)
    );
    return () => {
      clearTimeout(initialRefresh);
      unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void processPushNotificationResponse({
        response,
        canNavigate,
        queryClient,
        handledResponses,
        pendingResponse,
      });
    });
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      void getLocalPushDesired(userId).then((desired) => {
        if (!desired) return;
        void registerCurrentPushDevice(userId, token).catch((error) => {
          console.warn('Push token rotation registration failed', error);
        });
      });
    });
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      void processPushNotificationResponse({
        response: lastResponse,
        canNavigate,
        queryClient,
        handledResponses,
        pendingResponse,
      });
    }
    return () => {
      responseSubscription.remove();
      tokenSubscription.remove();
    };
  }, [canNavigate, queryClient, userId]);

  useEffect(() => {
    if (!canNavigate || !pendingResponse.current) return;
    const response = pendingResponse.current;
    pendingResponse.current = null;
    void processPushNotificationResponse({
      response,
      canNavigate,
      queryClient,
      handledResponses,
      pendingResponse,
    });
  }, [canNavigate, queryClient]);

  const value = {
    state,
    busy,
    enable,
    disable,
    refresh,
    offerAfterSuccessfulSend,
    openSettings: openSystemNotificationSettings,
  };

  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}
