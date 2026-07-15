import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  NativeSettingsEmptyRow,
  NativeSettingsRow,
  NativeSettingsSection,
} from '../../../components/ui/native-settings';
import { SettingsListScreen } from '../../../components/ui/settings-list-screen';
import { notifyDomainError, notifySuccess } from '../../../lib/appNotify';
import { queryKeys } from '../../../lib/queryKeys';
import { listBlockedUsers, listMyContentReports, unblockUser } from '../../../services/safetyService';

export default function SafetyScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const blockedQuery = useQuery({ queryKey: queryKeys.blockedUsers, queryFn: listBlockedUsers });
  const reportsQuery = useQuery({ queryKey: queryKeys.contentReports, queryFn: listMyContentReports });
  const loading = blockedQuery.isPending || reportsQuery.isPending;

  const refresh = async () => {
    await Promise.all([blockedQuery.refetch(), reportsQuery.refetch()]);
  };

  const confirmUnblock = (userId: string, username: string | null) => {
    Alert.alert(t('profile.unblockConfirmTitle'), t('profile.unblockConfirmMessage', { username: username ?? 'NiX' }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.unblock'),
        onPress: () => {
          void unblockUser(userId)
            .then(async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.blockedUsers });
              notifySuccess(t('profile.unblockSuccess'));
            })
            .catch((error: unknown) => notifyDomainError(error, t('profile.unblockFailure')));
        },
      },
    ]);
  };

  return (
    <>
      <SettingsListScreen loading={loading} onRefresh={refresh}>
        <NativeSettingsSection title={t('profile.blockedUsers')}>
          {blockedQuery.data?.length ? (
            blockedQuery.data.map((blocked) => (
              <NativeSettingsRow
                key={blocked.blocked_user_id}
                title={blocked.username ? `@${blocked.username}` : t('profile.unknownUser')}
                supportingText={t('profile.tapToUnblock')}
                avatar={{
                  url: null,
                  storagePath: blocked.avatar_storage_path,
                  emoji: blocked.avatar_emoji,
                  fallbackInitial: blocked.username ?? '?',
                }}
                onPress={() => confirmUnblock(blocked.blocked_user_id, blocked.username)}
              />
            ))
          ) : (
            <NativeSettingsEmptyRow text={t('profile.noBlockedUsers')} />
          )}
        </NativeSettingsSection>

        <NativeSettingsSection title={t('profile.myReports')}>
          {reportsQuery.data?.length ? (
            reportsQuery.data.map((report) => (
              <NativeSettingsRow
                key={report.id}
                title={t(`profile.reportReason.${report.reason}`)}
                supportingText={t('profile.reportStatus', {
                  status: t(`profile.reportState.${report.status}`),
                  date: new Date(report.created_at).toLocaleDateString(),
                })}
                icon="shield"
              />
            ))
          ) : (
            <NativeSettingsEmptyRow text={t('profile.noReports')} />
          )}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title>{t('profile.safetyCenter')}</Stack.Screen.Title>
    </>
  );
}
