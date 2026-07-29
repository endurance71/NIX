import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  NativeSettingsActionRow,
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { queryKeys } from '../../../lib/queryKeys';
import {
  listAppInstallations,
  signOutOtherInstallations,
} from '../../../services/appInstallationService';
import { notifyDomainError, notifySuccess } from '../../../lib/appNotify';

export default function DevicesScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.appInstallations,
    queryFn: listAppInstallations,
  });
  const rows = (query.data ?? []) as Awaited<ReturnType<typeof listAppInstallations>>;
  const otherActive = rows.filter((row) => !row.is_current && !row.revoked_at);

  const signOutOthers = () => {
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
        loading={query.isPending}
        onRefresh={async () => {
          await query.refetch();
        }}
      >
        <NativeSettingsSection title={t('devices.active')}>
          {rows.length === 0 ? (
            <NativeSettingsEmptyRow text={t('devices.empty')} />
          ) : (
            rows.map((row) => (
              <NativeSettingsRow
                key={row.installation_id}
                title={row.is_current ? t('devices.thisDevice', { name: row.device_name }) : row.device_name}
                supportingText={
                  row.revoked_at
                    ? t('devices.revoked')
                    : t('devices.lastSeen', { date: new Date(row.last_seen_at).toLocaleString() })
                }
                icon="devices"
                disabled={Boolean(row.revoked_at)}
              />
            ))
          )}
          {otherActive.length > 0 ? (
            <NativeSettingsActionRow
              title={t('devices.signOutOthers')}
              destructive
              onPress={signOutOthers}
            />
          ) : null}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('devices.title')}</Stack.Screen.Title>
    </>
  );
}
