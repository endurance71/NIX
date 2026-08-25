import { ActivityIndicator, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import { FieldGroup, RNHostView } from '@expo/ui';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../hooks/useAppTheme';
import { useProfileQrPayload } from '../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../components/friend/my-profile-qr-card';
import { useAuth } from '../hooks/useAuth';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { getCurrentUserProfile } from '../services/profileService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { NativeSettingsRow } from '../components/ui/native-settings';
import { SettingsListScreen } from '../components/ui/settings-list-screen';
import { createFriendInviteShareToken } from '../services/friendService';
import { buildFriendInviteShareLink } from '../lib/friendInvite';
import { notifyDomainError } from '../lib/appNotify';
import { recordProductEvent } from '../services/productAnalyticsService';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';

type ShareInviteOutcome =
  | { status: 'shared' | 'dismissed' }
  | { status: 'failed'; error: unknown };

async function shareFriendInvite(title: string, messageTemplate: string): Promise<ShareInviteOutcome> {
  try {
    const { token } = await createFriendInviteShareToken();
    const url = buildFriendInviteShareLink(token);
    const result = await Share.share({
      title,
      message: messageTemplate.replace('{{url}}', url),
      url,
    });
    return { status: result.action === Share.sharedAction ? 'shared' : 'dismissed' };
  } catch (error) {
    return { status: 'failed', error };
  }
}

export default function FriendMyCodeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { user, canUseNetworkSession } = useAuth();
  const qrPayload = useProfileQrPayload(canUseNetworkSession);
  const [shareBusy, setShareBusy] = useState(false);
  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 5,
  });
  const avatarPaths = profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : [];
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: canUseNetworkSession && avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarUrl = profileRow?.avatar_storage_path
    ? avatarUrls[profileRow.avatar_storage_path] ?? null
    : null;
  const fallbackInitial = (profileRow?.username ?? user?.email ?? '?')
    .replace(/^@/, '')
    .charAt(0)
    .toUpperCase();
  const qrSize = Math.max(180, Math.min(236, width - 112));

  const handleShareInvite = async () => {
    if (shareBusy || !canUseNetworkSession) return;
    setShareBusy(true);
    const result = await shareFriendInvite(
      t('profile.shareInviteTitle'),
      t('profile.shareInviteMessage', { url: '{{url}}' })
    );
    if (result.status === 'shared') {
      void recordProductEvent('invite_shared', { channel: 'share' });
    } else if (result.status === 'failed') {
      notifyDomainError(result.error, t('profile.shareInviteFailure'));
    }
    setShareBusy(false);
  };

  return (
    <>
      <SettingsListScreen loading={canUseNetworkSession && profilePending}>
        <FieldGroup.Section>
          <FieldGroup.SectionHeader>
            <RNHostView matchContents>
              <View style={styles.header}>
                <Text style={[styles.description, { color: colors.secondaryLabel }]}>
                  {t('profile.qrDescription')}
                </Text>
                <View style={styles.qrSlot}>
                  {canUseNetworkSession && qrPayload.loading ? (
                    <View style={styles.loading}>
                      <ActivityIndicator color={colors.label} />
                      <Text style={[styles.loadingText, { color: colors.secondaryLabel }]}>
                        {t('profile.qrGenerating')}
                      </Text>
                    </View>
                  ) : (
                    <MyProfileQrCard
                      payload={qrPayload.payload}
                      colors={colors}
                      error={canUseNetworkSession
                        ? qrPayload.error
                        : t('root.offlineActionUnavailable')}
                      size={qrSize}
                      centerOverlayRatio={0.28}
                      avatarUrl={avatarUrl}
                      avatarStoragePath={profileRow?.avatar_storage_path ?? null}
                      avatarEmoji={profileRow?.avatar_emoji}
                      fallbackInitial={fallbackInitial}
                    />
                  )}
                </View>
              </View>
            </RNHostView>
          </FieldGroup.SectionHeader>
          {iosRoadmapFeatures.shareInvites ? (
            <NativeSettingsRow
              title={shareBusy ? t('profile.shareInviteLoading') : t('profile.shareInvite')}
              icon="share"
              disabled={shareBusy || !canUseNetworkSession}
              onPress={() => void handleShareInvite()}
              testID="my-code-share"
            />
          ) : null}
          <NativeSettingsRow
            title={t('profile.scanQr')}
            icon="qrcode"
            showsChevron
            onPress={() => router.push('/friend-scan-qr')}
            testID="my-code-scan"
          />
        </FieldGroup.Section>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('profile.myQrCode')}</Stack.Screen.Title>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
  },
  description: {
    maxWidth: 340,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  qrSlot: {
    minHeight: 276,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
});
