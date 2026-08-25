import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { queryKeys } from '../../../lib/queryKeys';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../../../services/notificationPreferencesService';
import { notifyDomainError } from '../../../lib/appNotify';
import { recordProductEvent } from '../../../services/productAnalyticsService';
import { usePushNotifications } from '../../../context/pushNotifications';
import { useAuth } from '../../../hooks/useAuth';

export default function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const push = usePushNotifications();
  const { canUseNetworkSession } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: getNotificationPreferences,
    enabled: canUseNetworkSession,
  });
  const value = query.data ?? DEFAULT_NOTIFICATION_PREFERENCES;

  const update = async (
    key: keyof typeof DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: boolean
  ) => {
    if (!canUseNetworkSession) return;
    const previous = value;
    const next = { ...value, [key]: enabled };
    queryClient.setQueryData(queryKeys.notificationPreferences, next);
    try {
      await saveNotificationPreferences(next);
      void recordProductEvent('push_preference_changed', { enabled });
    } catch (error) {
      queryClient.setQueryData(queryKeys.notificationPreferences, previous);
      notifyDomainError(error, t('notifications.updateFailed'));
    }
  };

  return (
    <>
      <SettingsListScreen
        loading={canUseNetworkSession && query.isPending}
        onRefresh={async () => {
          if (canUseNetworkSession) await query.refetch();
        }}
      >
        <NativeSettingsSection title={t('notifications.device')}>
          <NativeSettingsRow
            title={t('notifications.devicePush')}
            supportingText={t(`push.state.${push.state}`)}
            icon="notification"
            switchValue={push.state === 'enabled'}
            onSwitchValueChange={(enabled) => {
              void (enabled ? push.enable() : push.disable());
            }}
            disabled={!canUseNetworkSession || push.busy || push.state === 'loading' || push.state === 'unavailable'}
          />
        </NativeSettingsSection>
        <NativeSettingsSection
          title={t('notifications.categories')}
          footer={t('notifications.securityAlwaysOn')}>
          <NativeSettingsRow
            title={t('notifications.messages')}
            supportingText={t('notifications.messagesDescription')}
            icon="message"
            switchValue={value.messages_enabled}
            onSwitchValueChange={(enabled) => void update('messages_enabled', enabled)}
            disabled={!canUseNetworkSession}
          />
          <NativeSettingsRow
            title={t('notifications.reactions')}
            icon="reaction"
            switchValue={value.reactions_enabled}
            onSwitchValueChange={(enabled) => void update('reactions_enabled', enabled)}
            disabled={!canUseNetworkSession}
          />
          <NativeSettingsRow
            title={t('notifications.friends')}
            icon="friends"
            switchValue={value.friends_enabled}
            onSwitchValueChange={(enabled) => void update('friends_enabled', enabled)}
            disabled={!canUseNetworkSession}
          />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>
        {t('notifications.title')}
      </Stack.Screen.Title>
    </>
  );
}
