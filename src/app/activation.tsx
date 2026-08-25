import { Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeScreen } from '../components/ui/native-screen';
import { NativeSectionCard } from '../components/ui/native-section-card';
import { NativeButton } from '../components/ui/native-button';
import { useAppTheme } from '../hooks/useAppTheme';
import { queryKeys } from '../lib/queryKeys';
import { getActivationState, updateActivationState } from '../services/activationService';
import { createFriendInviteShareToken } from '../services/friendService';
import { buildFriendInviteShareLink } from '../lib/friendInvite';
import { recordProductEvent } from '../services/productAnalyticsService';
import { APP_FONT_FAMILY } from '../theme/typography';
import { iosRoadmapFeatures } from '../config/iosRoadmapFeatures';
import { useAuth } from '../hooks/useAuth';
import { notifyInfo } from '../lib/appNotify';
import { OfflineStatusBanner } from '../components/auth/OfflineStatusBanner';

export default function ActivationScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { canUseNetworkSession } = useAuth();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.activationState,
    queryFn: getActivationState,
    enabled: canUseNetworkSession,
  });

  useEffect(() => {
    if (canUseNetworkSession) void updateActivationState('shown');
  }, [canUseNetworkSession]);

  useEffect(() => {
    if (data?.completed_at) router.replace('/(tabs)');
  }, [data?.completed_at]);

  const shareInvite = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    const { token } = await createFriendInviteShareToken();
    const url = buildFriendInviteShareLink(token);
    const result = await Share.share({
      title: t('activation.shareTitle'),
      message: t('activation.shareMessage', { url }),
      url,
    });
    if (result.action === Share.sharedAction) {
      void recordProductEvent('invite_shared', { channel: 'activation' });
    }
  };

  const skip = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    await updateActivationState('skip');
    await queryClient.invalidateQueries({ queryKey: queryKeys.activationState });
    router.replace('/(tabs)');
  };

  const dismissChecklist = async () => {
    if (!canUseNetworkSession) {
      notifyInfo(t('root.offlineActionUnavailable'));
      return;
    }
    await updateActivationState('dismiss');
    await queryClient.invalidateQueries({ queryKey: queryKeys.activationState });
    router.replace('/(tabs)/profile');
  };

  const steps = [
    { done: true, label: t('activation.privacyStep') },
    { done: data?.has_friend === true, label: t('activation.friendStep') },
    { done: data?.has_sent_nix === true, label: t('activation.firstNixStep') },
  ];

  return (
    <NativeScreen scroll>
      <OfflineStatusBanner />
      <NativeSectionCard
        title={t('activation.title')}
        subtitle={t('activation.subtitle')}>
        <View style={styles.steps}>
          {steps.map((step) => (
            <Text
              key={step.label}
              style={[styles.step, { color: step.done ? colors.success : colors.textSecondary }]}>
              {step.done ? '✓' : '○'} {step.label}
            </Text>
          ))}
        </View>
        {!data?.has_friend ? (
          <>
            {iosRoadmapFeatures.shareInvites ? (
              <NativeButton label={t('activation.shareInvite')} disabled={!canUseNetworkSession} onPress={() => void shareInvite()} />
            ) : null}
            <NativeButton
              label={t('activation.addByUsername')}
              variant="secondary"
              onPress={() => router.push('/(tabs)/profile/friends')}
            />
          </>
        ) : (
          <NativeButton
            label={t('activation.openCamera')}
            onPress={() => router.replace('/(tabs)')}
          />
        )}
        <NativeButton
          label={t('activation.skip')}
          variant="secondary"
          disabled={!canUseNetworkSession || isPending}
          onPress={() => void skip()}
        />
        {data?.skipped_at ? (
          <NativeButton
            label={t('activation.dismissChecklist')}
            variant="secondary"
            disabled={!canUseNetworkSession}
            onPress={() => void dismissChecklist()}
          />
        ) : null}
      </NativeSectionCard>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: 10 },
  step: { fontFamily: APP_FONT_FAMILY, fontSize: 16, lineHeight: 22 },
});
