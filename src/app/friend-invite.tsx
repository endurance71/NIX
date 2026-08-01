import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../hooks/useAppTheme';
import type { ThemeColors } from '../theme/colors';
import { APP_FONT_FAMILY } from '../theme/typography';
import {
  previewFriendInviteToken,
  redeemFriendInviteToken,
  sendFriendRequestByProfileQr,
  type FriendProfile,
  type RedeemInviteResult,
  type SendFriendRequestResult,
} from '../services/friendService';
import { NativeScreen } from '../components/ui/native-screen';
import { NativeSectionCard } from '../components/ui/native-section-card';
import { NativeButton } from '../components/ui/native-button';
import { clearPendingFriendInviteToken } from '../lib/pendingFriendInvite';
import { recordProductEvent } from '../services/productAnalyticsService';

type InviteResult = RedeemInviteResult | SendFriendRequestResult | 'own_profile' | 'invalid_profile';

type InvitePreviewOutcome =
  | { status: 'missing' | 'legacy' | 'own' | 'invalid' | 'failure' }
  | { status: 'ok'; profile: FriendProfile };

type InviteRedeemOutcome =
  | { status: 'failure' }
  | { status: 'ok'; result: InviteResult; username?: string; channel: 'share' | 'legacy' };

async function previewInvite(token?: string, profileId?: string): Promise<InvitePreviewOutcome> {
  if (!token && !profileId) return { status: 'missing' };
  if (profileId) return { status: 'legacy' };
  const inviteToken = token ?? '';
  try {
    const preview = await previewFriendInviteToken(inviteToken);
    if (preview.status !== 'ok' || !preview.profile) {
      return { status: preview.status === 'own_invite' ? 'own' : 'invalid' };
    }
    return { status: 'ok', profile: preview.profile };
  } catch {
    return { status: 'failure' };
  }
}

async function redeemInvite(token?: string, profileId?: string): Promise<InviteRedeemOutcome> {
  if (!token && !profileId) return { status: 'failure' };
  try {
    const result = profileId
      ? await sendFriendRequestByProfileQr(profileId)
      : await redeemFriendInviteToken(token ?? '');
    const username =
      'profile' in result ? result.profile?.username : result.inviterProfile?.username;
    await clearPendingFriendInviteToken();
    return {
      status: 'ok',
      result: result.result,
      username,
      channel: token ? 'share' : 'legacy',
    };
  } catch {
    return { status: 'failure' };
  }
}

export default function FriendInviteScreen() {
  const { t } = useTranslation();
  const raw = useLocalSearchParams<{ token?: string | string[]; profileId?: string | string[] }>();
  const token = Array.isArray(raw.token) ? raw.token[0] : raw.token;
  const profileId = Array.isArray(raw.profileId) ? raw.profileId[0] : raw.profileId;
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const resultMessage = (result: InviteResult, username?: string) => {
    if (result === 'request_sent') return t('invite.resultRequestSent', { username: username ?? t('common.unknown') });
    if (result === 'already_requested') return t('invite.resultAlreadyRequested');
    if (result === 'already_friends') return t('invite.resultAlreadyFriends', { username: username ?? t('common.unknown') });
    if (result === 'accepted_reverse_request') return t('invite.resultAccepted', { username: username ?? t('common.unknown') });
    if (result === 'own_invite' || result === 'own_profile') return t('invite.resultOwn');
    return t('invite.resultInvalid');
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const outcome = await previewInvite(token, profileId);
      if (cancelled) return;
      if (outcome.status === 'ok') {
        setProfile(outcome.profile);
      } else if (outcome.status === 'missing') {
        setMessage(t('invite.missing'));
      } else if (outcome.status === 'legacy') {
        setMessage(t('invite.legacyConfirm'));
      } else if (outcome.status === 'own') {
        setMessage(t('invite.resultOwn'));
        void clearPendingFriendInviteToken();
      } else if (outcome.status === 'invalid') {
        setMessage(t('invite.resultInvalid'));
        void clearPendingFriendInviteToken();
      } else {
        setMessage(t('invite.previewFailure'));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, t, token]);

  const accept = async () => {
    if (actionBusy || (!token && !profileId)) return;
    setActionBusy(true);
    const outcome = await redeemInvite(token, profileId);
    if (outcome.status === 'ok') {
      setMessage(resultMessage(outcome.result, outcome.username));
      setProfile(null);
      void recordProductEvent('invite_redeemed', { channel: outcome.channel });
    } else {
      setMessage(t('invite.redeemFailure'));
    }
    setActionBusy(false);
  };

  return (
    <NativeScreen scroll>
      <NativeSectionCard
        title={t('invite.title')}
        subtitle={profile ? t('invite.previewSubtitle') : t('invite.resultSubtitle')}>
        {loading ? (
          <ActivityIndicator color={colors.textPrimary} style={styles.loader} />
        ) : profile ? (
          <>
            <Text style={styles.profileName}>
              {profile.display_name || `@${profile.username}`}
            </Text>
            <Text style={styles.message}>@{profile.username}</Text>
            <NativeButton
              label={t('invite.accept')}
              loading={actionBusy}
              onPress={() => void accept()}
            />
            <NativeButton
              label={t('common.cancel')}
              variant="secondary"
              disabled={actionBusy}
              onPress={() => router.back()}
            />
          </>
        ) : (
          <>
            <Text style={styles.message}>{message ?? t('invite.missing')}</Text>
            {profileId && !message?.includes(t('invite.resultInvalid')) ? (
              <NativeButton
                label={t('invite.accept')}
                loading={actionBusy}
                onPress={() => void accept()}
              />
            ) : null}
            <NativeButton
              label={t('invite.goToProfile')}
              onPress={() => router.replace('/(tabs)/profile')}
            />
          </>
        )}
      </NativeSectionCard>
    </NativeScreen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loader: { marginTop: 16 },
    profileName: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      fontFamily: APP_FONT_FAMILY,
    },
    message: {
      color: colors.textSecondary,
      fontSize: 15,
      fontFamily: APP_FONT_FAMILY,
      lineHeight: 22,
    },
  });
