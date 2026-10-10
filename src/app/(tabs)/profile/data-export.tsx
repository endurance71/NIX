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
import { notifyDomainError, notifyError, notifySuccess } from '../../../lib/appNotify';
import { useAuth } from '../../../hooks/useAuth';
import { userHasEmailPasswordIdentity } from '../../../lib/authProviders';
import { reauthenticateAppleSession } from '../../../services/socialAuthService';

export default function DataExportScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { canUseNetworkSession, user, signIn } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.dataExportJobs,
    queryFn: listDataExportJobs,
    enabled: canUseNetworkSession,
    refetchInterval: (state) =>
      canUseNetworkSession && state.state.data?.some((job) => job.status === 'queued' || job.status === 'processing')
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
    if (!canUseNetworkSession) return;
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

  const openDownload = (jobId: string) =>
    createDataExportDownloadUrl(jobId).then((url) => Linking.openURL(url));

  // The server requires a sign-in from the last ten minutes, so confirm the
  // user's identity and retry once.
  const reauthenticateAndDownload = (jobId: string) => {
    if (!user) return;
    const retry = () =>
      openDownload(jobId).catch((error) => notifyDomainError(error, t('dataExport.downloadFailure')));
    if (userHasEmailPasswordIdentity(user) && user.email) {
      const email = user.email;
      Alert.prompt(
        t('dataExport.reauthTitle'),
        t('dataExport.reauthMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('dataExport.reauthAction'),
            onPress: (password?: string) => {
              if (!password) return;
              void signIn(email, password).then(({ error }) => {
                if (error) notifyError(t('dataExport.reauthFailure'));
                else void retry();
              });
            },
          },
        ],
        'secure-text'
      );
      return;
    }
    void reauthenticateAppleSession(user.id).then(({ error }) => {
      if (error) notifyError(t('dataExport.reauthFailure'));
      else void retry();
    });
  };

  const download = (jobId: string) => {
    if (!canUseNetworkSession) return;
    void openDownload(jobId).catch((error) => {
      if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
        reauthenticateAndDownload(jobId);
        return;
      }
      notifyDomainError(error, t('dataExport.downloadFailure'));
    });
  };

  return (
    <>
      <SettingsListScreen
        loading={canUseNetworkSession && query.isPending}
        onRefresh={async () => {
          if (canUseNetworkSession) await query.refetch();
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
            disabled={!canUseNetworkSession || hasRecentOrActive}
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
                showsChevron={canUseNetworkSession && job.status === 'ready'}
                onPress={canUseNetworkSession && job.status === 'ready' ? () => download(job.id) : undefined}
              />
            ))
          )}
        </NativeSettingsSection>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('dataExport.title')}</Stack.Screen.Title>
    </>
  );
}
