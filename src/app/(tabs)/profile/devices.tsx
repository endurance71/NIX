import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  NativeSettingsActionRow,
  NativeSettingsListStatus,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { resolveSettingsListState } from '../../../lib/settingsListState';
import { queryKeys } from '../../../lib/queryKeys';
import {
  listAppInstallations,
  signOutOtherInstallations,
} from '../../../services/appInstallationService';
import { notifyDomainError, notifySuccess } from '../../../lib/appNotify';
import { useAuth } from '../../../hooks/useAuth';
import { formatDeviceLastSeen } from '../../../lib/deviceActivity';
import { getCurrentLocale } from '../../../lib/i18n';

export default function DevicesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { canUseNetworkSession } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.appInstallations,
    queryFn: listAppInstallations,
    enabled: canUseNetworkSession,
  });
  // Relative times are measured from when the list was fetched (pure during render; a pull to
  // refresh updates both).
  const rows = (query.data ?? []) as Awaited<ReturnType<typeof listAppInstallations>>;
  const otherActive = rows.filter((row) => !row.is_current && !row.revoked_at);

  const signOutOthers = () => {
    if (!canUseNetworkSession) return;
    Alert.alert(t('devices.signOutTitle'), t('devices.signOutMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('devices.signOutOthers'),
        style: 'destructive',
        onPress: () => {
          void signOutOtherInstallations()
            .then(async (count) => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.appInstallations });
              notifySuccess(t('devices.signOutSuccess', { count }));
            })
            .catch((error) => notifyDomainError(error, t('devices.signOutFailure')));
        },
      },
    ]);
  };

  return (
    <>
      <SettingsListScreen
        loading={canUseNetworkSession && query.isPending}
        onRefresh={async () => {
          if (canUseNetworkSession) await query.refetch();
        }}
      >
        <NativeSettingsSection title={t('devices.active')}>
          {rows.length === 0 ? (
            <NativeSettingsListStatus
              state={resolveSettingsListState({
                itemCount: rows.length,
                hasData: query.data !== undefined,
                isError: query.isError,
                canUseNetworkSession,
              })}
              emptyText={t('devices.empty')}
              onRetry={() => void query.refetch()}
            />
          ) : (
            rows.map((row) => (
              <NativeSettingsRow
                key={row.installation_id}
                title={row.is_current ? t('devices.thisDevice', { name: row.device_name }) : row.device_name}
                supportingText={
                  row.revoked_at
                    ? t('devices.revoked')
                    : formatDeviceLastSeen(row.last_seen_at, query.dataUpdatedAt, getCurrentLocale(), t)
                }
                icon="devices"
                disabled={Boolean(row.revoked_at)}
              />
            ))
          )}
        </NativeSettingsSection>
        {otherActive.length > 0 ? (
          <NativeSettingsSection>
            <NativeSettingsActionRow
              title={t('devices.signOutOthers')}
              destructive
              appearance="row"
              disabled={!canUseNetworkSession}
              onPress={signOutOthers}
            />
          </NativeSettingsSection>
        ) : null}
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('devices.title')}</Stack.Screen.Title>
    </>
  );
}
