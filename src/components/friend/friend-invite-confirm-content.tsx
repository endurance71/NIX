import { useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ThemeColors } from '../../theme/colors';
import {
  FriendInviteRelationStatus,
  FriendProfile,
  friendErrorTelemetryCode,
  getFriendInviteRelationStatus,
  previewFriendInviteToken,
  previewProfileQr,
  redeemFriendInviteToken,
  sendFriendRequestByProfileQr,
} from '../../services/friendService';
import { createSignedAvatarUrl } from '../../services/avatarService';
import { fetchNixPublicProfiles } from '../../services/nixService';
import { trackEvent } from '../../lib/telemetry';
import i18n from '../../lib/i18n';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess, notifyShow } from '../../lib/appNotify';
import { notify as hapticNotify } from '../../lib/haptics';
import { runWithFinally } from '../../lib/runWithFinally';
import { AvatarCircle } from '../ui/avatar-circle';
import { AppIcon } from '../ui/app-icon';
import { ACTION_SHEET_AVATAR_SIZE, ActionSheetSurface } from '../ui/action-sheet-surface';
import { Button } from '../ui/button';
import { queryKeys } from '../../lib/queryKeys';
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type FriendInviteConfirmState = {
  loading: boolean;
  error: string | null;
  friendProfile: FriendProfile | null;
  avatarUrl: string | null;
  relationStatus: FriendInviteRelationStatus;
  actionLoading: boolean;
};

type FriendInviteConfirmAction =
  | { type: 'loading' }
  | {
      type: 'loaded';
      friendProfile: FriendProfile;
      avatarUrl: string | null;
      relationStatus: FriendInviteRelationStatus;
    }
  | { type: 'error'; error: string }
  | { type: 'actionLoading'; actionLoading: boolean };

const initialFriendInviteConfirmState: FriendInviteConfirmState = {
  loading: true,
  error: null,
  friendProfile: null,
  avatarUrl: null,
  relationStatus: 'none',
  actionLoading: false,
};

function friendInviteConfirmReducer(
  state: FriendInviteConfirmState,
  action: FriendInviteConfirmAction
): FriendInviteConfirmState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: null };
    case 'loaded':
      return {
        ...state,
        loading: false,
        error: null,
        friendProfile: action.friendProfile,
        avatarUrl: action.avatarUrl,
        relationStatus: action.relationStatus,
      };
    case 'error':
      return { ...state, loading: false, error: action.error };
    case 'actionLoading':
      return { ...state, actionLoading: action.actionLoading };
    default:
      return state;
  }
}

export type FriendInviteConfirmContentProps = {
  profileId?: string;
  token?: string;
  username: string;
  avatarStoragePath: string | null;
  avatarEmoji: string | null;
  onDismiss: () => void;
  /** Profile the caller already previewed (scanner): skips a second preview request. */
  initialProfile?: FriendProfile | null;
  /** `sheet` inside a native bottom sheet (scanner), `screen` as a full page (deep link). */
  presentation?: 'sheet' | 'screen';
  channel?: 'qr' | 'share' | 'legacy';
  /** After a successful add/accept. Defaults to closing and going back (usually to Friends). */
  onCompleted?: () => void;
  /** Opens the chat with an existing friend. Defaults to closing, then pushing the chat. */
  onOpenChat?: (peerId: string) => void;
  /** The invite resolved to something final (redeemed, invalid, own): lets the caller clean up. */
  onSettled?: () => void;
};

function defaultCompleted(onDismiss: () => void) {
  onDismiss();
  // Back to wherever the scanner was opened from (usually Friends), not the Profile root.
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile/friends');
}

function defaultOpenChat(onDismiss: () => void, peerId: string) {
  onDismiss();
  router.push({ pathname: '/chat/[peerId]', params: { peerId } });
}

/** Display name for public profiles whose preview RPC returns only the username (tokens). */
async function withDisplayName(profile: FriendProfile): Promise<FriendProfile> {
  if (profile.display_name) return profile;
  try {
    const profiles = await fetchNixPublicProfiles([profile.id]);
    return { ...profile, display_name: profiles.get(profile.id)?.display_name ?? null };
  } catch {
    return profile;
  }
}

export function FriendInviteConfirmContent({
  profileId,
  token,
  username,
  avatarStoragePath,
  avatarEmoji,
  onDismiss,
  initialProfile = null,
  presentation = 'sheet',
  channel = 'qr',
  onCompleted,
  onOpenChat,
  onSettled,
}: FriendInviteConfirmContentProps) {
  const nativeBottomSheet = presentation === 'sheet';
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = createSheetStyles(colors);

  const [confirmState, dispatchConfirmState] = useReducer(
    friendInviteConfirmReducer,
    initialFriendInviteConfirmState,
  );
  const { loading, error, friendProfile, avatarUrl, relationStatus, actionLoading } = confirmState;

  useEffect(() => {
    const loadProfileData = async () => {
      await runWithFinally(
        async () => {
          try {
            dispatchConfirmState({ type: 'loading' });

            let previewProfile = initialProfile;
            if (!previewProfile) {
              const preview = token
                ? await previewFriendInviteToken(token)
                : await previewProfileQr(profileId ?? '');

              if (
                preview.status === 'invalid_profile' ||
                preview.status === 'invalid_or_expired' ||
                !preview.profile
              ) {
                dispatchConfirmState({ type: 'error', error: i18n.t('invite.confirmProfileUnavailable') });
                onSettledRef.current?.();
                return;
              }

              if (preview.status === 'own_profile' || preview.status === 'own_invite') {
                dispatchConfirmState({ type: 'error', error: i18n.t('invite.confirmOwnProfile') });
                onSettledRef.current?.();
                return;
              }
              previewProfile = preview.profile;
            }

            const baseProfile: FriendProfile = {
              ...previewProfile,
              avatar_storage_path: previewProfile.avatar_storage_path ?? avatarStoragePath,
              avatar_emoji: previewProfile.avatar_emoji ?? avatarEmoji,
            };
            const avatarPath = baseProfile.avatar_storage_path;

            const [mergedProfile, nextAvatarUrl, nextRelationStatus] = await Promise.all([
              withDisplayName(baseProfile),
              avatarPath
                ? createSignedAvatarUrl(avatarPath).catch((err: unknown) => {
                    console.warn('Failed to load friend avatar signed URL', err);
                    return null;
                  })
                : Promise.resolve(null),
              getFriendInviteRelationStatus(baseProfile.id).catch(
                (): FriendInviteRelationStatus => 'none',
              ),
            ]);

            dispatchConfirmState({
              type: 'loaded',
              friendProfile: mergedProfile,
              avatarUrl: nextAvatarUrl,
              relationStatus: nextRelationStatus,
            });
          } catch (err: unknown) {
            console.warn('Failed to load friend invite profile', err);
            dispatchConfirmState({
              type: 'error',
              error: i18n.t('invite.confirmLoadFailed'),
            });
          }
        },
        () => {},
      );
    };

    const loadProfileDataId = setTimeout(() => {
      void loadProfileData();
    }, 0);

    return () => {
      clearTimeout(loadProfileDataId);
    };
  }, [profileId, token, avatarStoragePath, avatarEmoji, initialProfile]);

  const displayUsername = friendProfile?.username ?? username;
  const displayName = friendProfile?.display_name?.trim() || null;

  const primaryLabel = () =>
    relationStatus === 'incoming_pending' ? t('invite.confirmAcceptInvite') : t('profile.addFriend');

  const handleSend = async () => {
    if (!profileId && !token) {
      notifyError(i18n.t('notify.missingQrData'), { message: i18n.t('notify.qrReadFailed') });
      return;
    }

    if (relationStatus === 'already_friends' || relationStatus === 'outgoing_pending') {
      return;
    }

    dispatchConfirmState({ type: 'actionLoading', actionLoading: true });
    await runWithFinally(
      async () => {
        const result = token
          ? await redeemFriendInviteToken(token)
          : await sendFriendRequestByProfileQr(profileId ?? '');
        const resultCode = result.result;
        const resultProfile = 'inviterProfile' in result ? result.inviterProfile : result.profile;
        trackEvent('friend_invite_redeem', {
          channel,
          status: 'success',
          result: resultCode,
        });
        onSettled?.();
        void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
        void queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests });
        void queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests });
        const message = mapConfirmationMessage(
          resultCode,
          resultProfile?.username ?? displayUsername,
        );
        const title = confirmationTitle(resultCode);
        switch (resultCode) {
          case 'request_sent':
          case 'already_friends':
          case 'accepted_reverse_request':
            hapticNotify('success');
            notifySuccess(title, { message });
            break;
          case 'already_requested':
            notifyInfo(title, { message });
            break;
          case 'own_profile':
          case 'invalid_profile':
          case 'invalid_or_expired':
          case 'own_invite':
            hapticNotify('error');
            notifyError(title, { message });
            break;
          default:
            notifyShow({ title, message });
        }
        if (onCompleted) onCompleted();
        else defaultCompleted(onDismiss);
      },
      () => dispatchConfirmState({ type: 'actionLoading', actionLoading: false }),
    ).catch((err: unknown) => {
      trackEvent('friend_invite_redeem', {
        channel,
        status: 'fail',
        errorCode: friendErrorTelemetryCode(err),
      });
      hapticNotify('error');
      notifyDomainError(err, i18n.t('notify.inviteSendFailed'));
    });
  };

  if (loading) {
    return (
      <ActionSheetSurface
        title={t('profile.addFriend')}
        message={channel === 'qr' ? t('invite.confirmScannedMessage') : t('invite.confirmLinkMessage')}
        nativeBottomSheet={nativeBottomSheet}>
        <View style={styles.loaderContent}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={[styles.loaderLabel, { color: colors.textSecondary }]}>
            {t('invite.confirmLoadingProfile')}
          </Text>
        </View>
      </ActionSheetSurface>
    );
  }

  if (error) {
    return (
      <ActionSheetSurface
        title={t('profile.addFriend')}
        message={error}
        nativeBottomSheet={nativeBottomSheet}
        actions={<Button variant="tertiary" fullWidth title={t('common.close')} onPress={onDismiss} />}
      />
    );
  }

  return (
    <ActionSheetSurface
      title={t('profile.addFriend')}
      message={
        channel === 'qr'
          ? t('invite.confirmScannedApprovalMessage')
          : t('invite.confirmLinkApprovalMessage')
      }
      contentAlign="stretch"
      nativeBottomSheet={nativeBottomSheet}
      actions={
        <>
          {(relationStatus === 'none' || relationStatus === 'incoming_pending') && (
            <Button
              size="large"
              fullWidth
              title={primaryLabel()}
              loading={actionLoading}
              onPress={handleSend}
            />
          )}
          {relationStatus === 'already_friends' && friendProfile ? (
            <Button
              size="large"
              fullWidth
              title={t('invite.confirmOpenChat')}
              onPress={() =>
                onOpenChat
                  ? onOpenChat(friendProfile.id)
                  : defaultOpenChat(onDismiss, friendProfile.id)
              }
            />
          ) : null}
          <Button
            variant="tertiary"
            fullWidth
            title={
              relationStatus === 'already_friends' || relationStatus === 'outgoing_pending'
                ? t('common.close')
                : t('common.cancel')
            }
            onPress={onDismiss}
            disabled={actionLoading}
          />
        </>
      }>
      <View style={styles.avatarContainer}>
        <AvatarCircle
          size={ACTION_SHEET_AVATAR_SIZE}
          url={avatarUrl}
          storagePath={friendProfile?.avatar_storage_path}
          emoji={friendProfile?.avatar_emoji}
          fallbackInitial={displayUsername.charAt(0)}
        />
      </View>

      {displayName ? (
        <Text style={[styles.handle, { color: colors.textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
      ) : null}
      <Text
        style={[
          displayName ? styles.secondaryHandle : styles.handle,
          { color: displayName ? colors.textSecondary : colors.textPrimary },
        ]}
        numberOfLines={1}>
        @{displayUsername || t('invite.confirmUnknownUsername')}
      </Text>

      <FriendRelationStatus relationStatus={relationStatus} />
    </ActionSheetSurface>
  );
}

function FriendRelationStatus({ relationStatus }: { relationStatus: FriendInviteRelationStatus }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = createSheetStyles(colors);
  const statusLineKey = relationStatusCopyKey(relationStatus);
  const statusLine = statusLineKey ? t(statusLineKey) : null;
  return statusLine ? (
    <View style={styles.statusBlock}>
      {relationStatus === 'already_friends' ? (
        <AppIcon name="checkCircle" size={APP_ICON_SIZE.xl} color={colors.success} />
      ) : relationStatus === 'outgoing_pending' ? (
        <AppIcon name="clock" size={APP_ICON_SIZE.lg} color={colors.textMuted} />
      ) : (
        <AppIcon name="personAdd" size={APP_ICON_SIZE.lg} color={colors.accentText} />
      )}
      <Text
        style={[
          styles.statusLineText,
          { color: relationStatus === 'already_friends' ? colors.success : colors.textSecondary },
        ]}>
        {statusLine}
      </Text>
    </View>
  ) : null;
}

function mapConfirmationMessage(result: string, username?: string) {
  const name = username ?? i18n.t('notify.unknownUsername');
  if (result === 'request_sent') return i18n.t('notify.qrInviteSent', { username: name });
  if (result === 'already_requested') return i18n.t('notify.qrInviteAlreadySent');
  if (result === 'already_friends') return username
    ? i18n.t('notify.qrAlreadyFriendsWith', { username }) : i18n.t('notify.qrAlreadyFriends');
  if (result === 'accepted_reverse_request') return i18n.t('notify.qrInviteAccepted', { username: name });
  if (result === 'own_profile' || result === 'own_invite') return i18n.t('notify.cannotAddSelf');
  if (result === 'invalid_or_expired') return i18n.t('notify.expiredQrBody');
  return i18n.t('notify.inviteSendFailed');
}

function confirmationTitle(result: string) {
  if (result === 'request_sent') return i18n.t('notify.inviteSentTitle');
  if (result === 'already_requested') return i18n.t('notify.inviteAlreadySentTitle');
  if (result === 'already_friends') return i18n.t('notify.alreadyFriendsTitle');
  if (result === 'accepted_reverse_request') return i18n.t('notify.inviteAcceptedTitle');
  if (result === 'own_profile' || result === 'own_invite') return i18n.t('notify.ownQr');
  if (result === 'invalid_profile') return i18n.t('notify.profileNotFound');
  return i18n.t('notify.invalidQr');
}

function relationStatusCopyKey(status: FriendInviteRelationStatus) {
  if (status === 'already_friends') return 'invite.relationAlreadyFriends' as const;
  if (status === 'outgoing_pending') return 'invite.relationOutgoingPending' as const;
  if (status === 'incoming_pending') return 'invite.relationIncomingPending' as const;
  return null;
}

const createSheetStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loaderContent: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      minHeight: ACTION_SHEET_AVATAR_SIZE + spacing.sm,
      paddingVertical: spacing.xs,
    },
    loaderLabel: {
      ...typography.subheadline,
    },
    avatarContainer: {
      alignItems: 'center',
      marginVertical: spacing.xs,
    },
    secondaryHandle: {
      ...typography.subheadline,
      textAlign: 'center',
      marginTop: -6,
    },
    handle: {
      ...typography.headline,
      textAlign: 'center',
      letterSpacing: -0.2,
    },
    statusBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      marginVertical: spacing.xxs,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      backgroundColor: colors.secondarySystemFill,
    },
    statusLineText: {
      ...typography.subheadline,
      fontWeight: '500',
      textAlign: 'center',
      paddingHorizontal: spacing.sm,
    },
  });
