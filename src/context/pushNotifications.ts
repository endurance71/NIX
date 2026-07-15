import { createContext, use } from 'react';

export type PushNotificationUiState =
  | 'loading'
  | 'enabled'
  | 'disabled'
  | 'denied'
  | 'unavailable'
  | 'error';

export type PushNotificationsContextValue = {
  state: PushNotificationUiState;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  refresh: () => Promise<void>;
  offerAfterSuccessfulSend: () => Promise<void>;
  openSettings: () => Promise<void>;
};

const fallback: PushNotificationsContextValue = {
  state: 'disabled',
  busy: false,
  enable: async () => {},
  disable: async () => {},
  refresh: async () => {},
  offerAfterSuccessfulSend: async () => {},
  openSettings: async () => {},
};

export const PushNotificationsContext = createContext<PushNotificationsContextValue>(fallback);

export function usePushNotifications() {
  return use(PushNotificationsContext);
}
