import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { sendQuickTextReply } from '../lib/viewerQuickReply';
import { router } from 'expo-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PushNotificationsContext,
  pushNotificationsFallback,
  type PushNotificationUiState,
} from './pushNotifications';
import {
  disableCurrentPushDevice,
  ensureBadgePermission,
  getInstallationId,
  getLocalPushDesired,
  getPushDeviceState,
  getPushPermissionState,
  getPushPromptOffers,
  markPushPromptOffers,
  openSystemNotificationSettings,
  registerCurrentPushDevice,
  requestPushPermission,
  setLocalPushDesired,
  subscribeToAppForeground,
  touchCurrentPushDevice,
} from '../services/pushNotificationService';
import {
  parsePushNotificationData,
  routeForPushNotification,
  shouldSuppressForegroundPush,
} from '../lib/pushNotificationPayload';
import { decidePushRationale, type PushRationaleSource } from '../lib/pushRationale';
import { appNotificationQueue } from '../lib/notificationQueue';
import { queryKeys } from '../lib/queryKeys';
import { notifyError } from '../lib/appNotify';
import { trackEvent } from '../lib/telemetry';
import { activeChatPeerRef } from '../lib/activeChatPeer';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = parsePushNotificationData(notification.request.content.data);
    const suppress = shouldSuppressForegroundPush(data, activeChatPeerRef.current);

    return {
      shouldPlaySound: !suppress,
      shouldSetBadge: !suppress,
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
    };
  },
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
      await ensureBadgePermission();
      await registerCurrentPushDevice(userId);
      setState('enabled');
      return;
    }
    if (permission === 'granted' && remote.enabled) {
      if (!desired) await setLocalPushDesired(userId, true);
      await ensureBadgePermission();
      try {
        await touchCurrentPushDevice();
      } catch (error) {
        console.warn('Push device heartbeat failed', error);
      }
      setState('enabled');
      return;
    }
    setState('disabled');
  } catch (error) {
    console.warn('Push notification state refresh failed', error);
    setState('error');
  }
}

/** Notification category with an inline "Reply" text field (set by push-dispatch as `categoryId`). */
export const NIX_REPLY_CATEGORY = 'nix_reply';
const NIX_REPLY_ACTION = 'reply';

async function processPushNotificationResponse({
  response,
  canNavigate,
  queryClient,
  handledResponses,
  pendingResponse,
  ownerId,
}: {
  response: Notifications.NotificationResponse;
  canNavigate: boolean;
  queryClient: QueryClient;
  handledResponses: { current: Set<string> };
  pendingResponse: { current: Notifications.NotificationResponse | null };
  ownerId: string;
}) {
  const identifier = response.notification.request.identifier;
  if (handledResponses.current.has(identifier)) return;
  // Inline reply from the notification: queue the text (durable outbox) without opening a screen.
  if (response.actionIdentifier === NIX_REPLY_ACTION) {
    const replyTo = parsePushNotificationData(response.notification.request.content.data);
    handledResponses.current.add(identifier);
    if (replyTo?.actorId && response.userText?.trim()) {
      await sendQuickTextReply({
        ownerId,
        peerId: replyTo.actorId,
        body: response.userText,
        online: true,
        queryClient,
        // A „new NiX” push carries the NiX id: the reply is shown attached to it in the chat.
        replyToNixId: replyTo.type === 'new_nix' ? replyTo.entityId : null,
      }).catch((error) => console.warn('Notification reply failed', error));
      trackEvent('push_notification_replied', { type: replyTo.type });
    }
    await Notifications.clearLastNotificationResponseAsync();
    return;
  }
  if (!canNavigate) {
    pendingResponse.current = response;
    return;
  }
  const data = parsePushNotificationData(response.notification.request.content.data);
  if (!data) return;
  handledResponses.current.add(identifier);
  if (data.type === 'new_text_message' || data.type === 'message_reaction') {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.textMessagesWithPeer(data.actorId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.messageReactionsWithPeer(data.actorId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
    ]);
  } else if (data.type === 'friend_accepted') {
    await queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
  } else {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
    ]);
  }
  trackEvent('push_notification_opened', { type: data.type });
  // `navigate` reuses an already open chat/tab instead of stacking a duplicate screen (NOTIF-11).
  router.navigate(routeForPushNotification(data) as any);
  await Notifications.clearLastNotificationResponseAsync();
}

/**
 * Always mounted around the navigation tree; `enabled` turns push handling on
 * and off so a session or connectivity change never remounts the children.
 */
export function PushNotificationsProvider({
  userId: sessionUserId,
  enabled,
  canNavigate,
  children,
}: {
  userId: string | null;
  enabled: boolean;
  canNavigate: boolean;
  children: ReactNode;
}) {
  const userId = enabled ? sessionUserId : null;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PushNotificationUiState>('loading');
  const [busy, setBusy] = useState(false);
  const handledResponses = useRef<Set<string>>(new Set());
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);

  const refresh = useCallback(
    async () => {
      if (userId) await refreshPushNotificationState(userId, setState);
    },
    [userId]
  );

  const showSettingsAlert = useCallback(() => {
    Alert.alert(t('push.permissionDeniedTitle'), t('push.permissionDeniedBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('push.openSettings'), onPress: () => void openSystemNotificationSettings() },
    ]);
  }, [t]);

  const enable = useCallback(async () => {
    if (busy || !userId) return;
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
        await ensureBadgePermission();
        setState('enabled');
        trackEvent('push_device_toggle', { enabled: true });
      } catch (error) {
        console.warn('Push notification enable failed', error);
        notifyError(t('push.enableFailed'), { message: t('push.tryAgain') });
        await refresh();
      }
    });
  }, [busy, refresh, showSettingsAlert, t, userId]);

  const disable = useCallback(async () => {
    if (busy || !userId) return;
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
  }, [busy, refresh, t, userId]);

  const offerPushRationale = useCallback(async (source: PushRationaleSource) => {
    if (!userId || state === 'enabled' || state === 'denied' || state === 'unavailable' || state === 'loading' || busy) {
      return;
    }
    const offers = decidePushRationale(source, await getPushPromptOffers(userId));
    if (!offers) return;
    await markPushPromptOffers(userId, offers);
    // Never drop a system Alert onto a banner that is still entering or leaving.
    await appNotificationQueue.whenSettled();
    trackEvent('push_rationale_shown', { source });
    Alert.alert(t('push.rationaleTitle'), t('push.rationaleBody'), [
      { text: t('push.notNow'), style: 'cancel' },
      { text: t('push.enableAction'), onPress: () => void enable() },
    ]);
  }, [busy, enable, state, t, userId]);

  const offerAfterSuccessfulSend = useCallback(async () => {
    await offerPushRationale('after_send');
  }, [offerPushRationale]);
  const offerPushRationaleFromEffect = useEffectEvent(() => {
    void offerPushRationale('onboarding');
  });

  useEffect(() => {
    if (!userId) return;
    const initialRefresh = setTimeout(
      () => void refresh(),
      0
    );
    const unsubscribe = subscribeToAppForeground(
      () => void refresh()
    );
    return () => {
      clearTimeout(initialRefresh);
      unsubscribe();
    };
  }, [refresh, userId]);

  // After onboarding, offer push once so receivers (not only senders) register a token.
  useEffect(() => {
    if (!userId || !canNavigate || state !== 'disabled' || busy) return;
    const timer = setTimeout(offerPushRationaleFromEffect, 800);
    return () => clearTimeout(timer);
  }, [busy, canNavigate, state, userId]);

  useEffect(() => {
    if (!userId) return;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void processPushNotificationResponse({
        response,
        canNavigate,
        queryClient,
        handledResponses,
        pendingResponse,
        ownerId: userId,
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
        ownerId: userId,
      });
    }
    return () => {
      responseSubscription.remove();
      tokenSubscription.remove();
    };
  }, [canNavigate, queryClient, userId]);

  useEffect(() => {
    if (!canNavigate || !pendingResponse.current || !userId) return;
    const response = pendingResponse.current;
    pendingResponse.current = null;
    void processPushNotificationResponse({
      response,
      canNavigate,
      queryClient,
      handledResponses,
      pendingResponse,
      ownerId: userId,
    });
  }, [canNavigate, queryClient, userId]);

  // The inline "Reply" action on message notifications; titles follow the app language.
  useEffect(() => {
    if (!userId) return;
    void Notifications.setNotificationCategoryAsync(NIX_REPLY_CATEGORY, [
      {
        identifier: NIX_REPLY_ACTION,
        buttonTitle: t('push.replyAction'),
        textInput: { submitButtonTitle: t('push.replySend'), placeholder: t('push.replyPlaceholder') },
        options: { opensAppToForeground: false },
      },
    ]).catch((error) => console.warn('Notification category setup failed', error));
  }, [t, userId]);

  const value = useMemo(() => userId ? ({
    state,
    busy,
    enable,
    disable,
    refresh,
    offerAfterSuccessfulSend,
    openSettings: openSystemNotificationSettings,
  }) : pushNotificationsFallback, [busy, disable, enable, offerAfterSuccessfulSend, refresh, state, userId]);

  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}
