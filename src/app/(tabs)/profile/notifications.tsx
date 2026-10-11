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
  // NOTIF-14: never present DEFAULT_NOTIFICATION_PREFERENCES as the user's real choice. Until the
  // server (or the persisted query cache) has answered, the category rows have no switch.
  const preferences = query.data;
  const categoriesFooter = preferences
    ? t('notifications.securityAlwaysOn')
    : !canUseNetworkSession
      ? t('root.offlineCacheMissing')
      : query.isError
        ? t('notifications.loadFailed')
        : t('common.loading');
  const categoriesEditable = canUseNetworkSession && Boolean(preferences);

  const update = async (
    key: keyof typeof DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: boolean
  ) => {
    if (!canUseNetworkSession || !preferences) return;
    const previous = preferences;
    const next = { ...preferences, [key]: enabled };
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
          footer={categoriesFooter}>
          <NativeSettingsRow
            title={t('notifications.messages')}
            supportingText={
              preferences
                ? t('notifications.messagesDescription')
                : `${t('notifications.messagesDescription')} · ${t('notifications.stateUnknown')}`
            }
            icon="message"
            switchValue={preferences?.messages_enabled}
            onSwitchValueChange={(enabled) => void update('messages_enabled', enabled)}
            disabled={!categoriesEditable}
          />
          <NativeSettingsRow
            title={t('notifications.reactions')}
            supportingText={preferences ? undefined : t('notifications.stateUnknown')}
            icon="reaction"
            switchValue={preferences?.reactions_enabled}
            onSwitchValueChange={(enabled) => void update('reactions_enabled', enabled)}
            disabled={!categoriesEditable}
          />
          <NativeSettingsRow
            title={t('notifications.friends')}
            supportingText={preferences ? undefined : t('notifications.stateUnknown')}
            icon="friends"
            switchValue={preferences?.friends_enabled}
            onSwitchValueChange={(enabled) => void update('friends_enabled', enabled)}
            disabled={!categoriesEditable}
          />
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>
        {t('notifications.title')}
      </Stack.Screen.Title>
    </>
  );
}
