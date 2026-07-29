import { Alert, Linking } from 'react-native';
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
  createDataExportDownloadUrl,
  listDataExportJobs,
  requestDataExport,
} from '../../../services/dataExportService';
import { notifyDomainError, notifySuccess } from '../../../lib/appNotify';

export default function DataExportScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.dataExportJobs,
    queryFn: listDataExportJobs,
    refetchInterval: (state) =>
      state.state.data?.some((job) => job.status === 'queued' || job.status === 'processing')
        ? 10_000
        : false,
  });
  const jobs = query.data ?? [];
  const hasRecentOrActive = jobs.some(
    (job) =>
      job.status === 'queued' ||
      job.status === 'processing' ||
      query.dataUpdatedAt - new Date(job.requested_at).getTime() < 24 * 60 * 60 * 1000
  );

  const requestExport = () => {
    Alert.alert(t('dataExport.requestTitle'), t('dataExport.requestMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('dataExport.requestAction'),
        onPress: () => {
          void requestDataExport()
            .then(async () => {
              await queryClient.invalidateQueries({ queryKey: queryKeys.dataExportJobs });
              notifySuccess(t('dataExport.requestSuccess'));
            })
            .catch((error) => notifyDomainError(error, t('dataExport.requestFailure')));
        },
      },
    ]);
  };

  const download = (jobId: string) => {
    void createDataExportDownloadUrl(jobId)
      .then((url) => Linking.openURL(url))
      .catch((error) => notifyDomainError(error, t('dataExport.downloadFailure')));
  };

  return (
    <>
      <SettingsListScreen
        loading={query.isPending}
        onRefresh={async () => {
          await query.refetch();
        }}
      >
        <NativeSettingsSection title={t('dataExport.title')}>
          <NativeSettingsRow
            title={t('dataExport.description')}
            supportingText={t('dataExport.retention')}
            icon="download"
          />
          <NativeSettingsActionRow
            title={t('dataExport.requestAction')}
            disabled={hasRecentOrActive}
            onPress={requestExport}
          />
        </NativeSettingsSection>
        <NativeSettingsSection title={t('dataExport.history')}>
          {jobs.length === 0 ? (
            <NativeSettingsEmptyRow text={t('dataExport.empty')} />
          ) : (
            jobs.map((job) => (
              <NativeSettingsRow
                key={job.id}
                title={t(`dataExport.status.${job.status}`)}
                supportingText={new Date(job.requested_at).toLocaleString()}
                icon="download"
                showsChevron={job.status === 'ready'}
                onPress={job.status === 'ready' ? () => download(job.id) : undefined}
              />
            ))
          )}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('dataExport.title')}</Stack.Screen.Title>
    </>
  );
}
