import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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

export default function FriendMyCodeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const qrPayload = useProfileQrPayload();
  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile,
    queryFn: getCurrentUserProfile,
    staleTime: 1000 * 60 * 5,
  });
  const avatarPaths = profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : [];
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
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

  return (
    <>
      <SettingsListScreen loading={profilePending}>
        <FieldGroup.Section>
          <FieldGroup.SectionHeader>
            <RNHostView matchContents>
              <View style={styles.header}>
                <Text style={[styles.description, { color: colors.secondaryLabel }]}>
                  {t('profile.qrDescription')}
                </Text>
                <View style={styles.qrSlot}>
                  {qrPayload.loading ? (
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
                      error={qrPayload.error}
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
