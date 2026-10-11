import { router, useLocalSearchParams } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../hooks/useAppTheme';
import { typography } from '../theme/typography';
import { NativeScreen } from '../components/ui/native-screen';
import { Button } from '../components/ui/button';
import { FriendInviteConfirmContent } from '../components/friend/friend-invite-confirm-content';
import { clearPendingFriendInviteToken } from '../lib/pendingFriendInvite';
import { recordProductEvent } from '../services/productAnalyticsService';
import { paramFirst } from '../lib/previewRoute';

function leaveInvite() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile/friends');
}

/**
 * Invite deep link (`/invite/<token>`, legacy `?profileId=`): the same confirm UI as after a QR
 * scan, shown as a page instead of a sheet.
 */
export default function FriendInviteScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const raw = useLocalSearchParams<{ token?: string | string[]; profileId?: string | string[] }>();
  const token = paramFirst(raw.token);
  const profileId = paramFirst(raw.profileId);
  const channel = token ? 'share' : 'legacy';

  if (!token && !profileId) {
    return (
      <NativeScreen scroll>
        <Text selectable style={[styles.message, { color: colors.textSecondary }]}>
          {t('invite.missing')}
        </Text>
        <Button size="large" fullWidth title={t('invite.goToProfile')} onPress={() => router.replace('/(tabs)/profile')} />
      </NativeScreen>
    );
  }

  return (
    <NativeScreen scroll>
      <FriendInviteConfirmContent
        token={token}
        profileId={profileId}
        username=""
        avatarStoragePath={null}
        avatarEmoji={null}
        presentation="screen"
        channel={channel}
        onDismiss={leaveInvite}
        // Redeemed or found invalid/own: the stored pending invite is done either way.
        onSettled={() => void clearPendingFriendInviteToken()}
        onCompleted={() => {
          void recordProductEvent('invite_redeemed', { channel });
          leaveInvite();
        }}
        onOpenChat={(peerId) => router.replace({ pathname: '/chat/[peerId]', params: { peerId } })}
      />
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  message: {
    ...typography.callout,
  },
});
