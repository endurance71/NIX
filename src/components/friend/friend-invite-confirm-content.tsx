import { useEffect, useReducer } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ThemeColors } from '../../theme/colors';
import {
  FriendInviteRelationStatus,
  FriendProfile,
  getFriendInviteRelationStatus,
  previewFriendInviteToken,
  previewProfileQr,
  redeemFriendInviteToken,
  sendFriendRequestByProfileQr,
} from '../../services/friendService';
import { createSignedAvatarUrl } from '../../services/avatarService';
import { trackEvent } from '../../lib/telemetry';
import { notifyError, notifyInfo, notifySuccess, notifyShow } from '../../lib/appNotify';
import { tap } from '../../lib/haptics';
import { runWithFinally } from '../../lib/runWithFinally';
import { AvatarCircle } from '../ui/avatar-circle';
import { AppIcon } from '../ui/app-icon';
import {
  ACTION_SHEET_AVATAR_SIZE,
  ActionSheetPrimaryButton,
  ActionSheetSecondaryButton,
  ActionSheetSurface,
} from '../ui/action-sheet-surface';
import { queryKeys } from '../../lib/queryKeys';
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { APP_FONT_FAMILY } from '../../theme/typography';

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
};

export function FriendInviteConfirmContent({
  profileId,
  token,
  username,
  avatarStoragePath,
  avatarEmoji,
  onDismiss,
}: FriendInviteConfirmContentProps) {
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = createSheetStyles(colors);

  const [confirmState, dispatchConfirmState] = useReducer(
    friendInviteConfirmReducer,
    initialFriendInviteConfirmState
  );
  const { loading, error, friendProfile, avatarUrl, relationStatus, actionLoading } = confirmState;

  useEffect(() => {
    const loadProfileData = async () => {
      await runWithFinally(
        async () => {
          try {
            dispatchConfirmState({ type: 'loading' });

            const preview = token
              ? await previewFriendInviteToken(token)
              : await previewProfileQr(profileId ?? '');

            if (preview.status === 'invalid_profile' || preview.status === 'invalid_or_expired' || !preview.profile) {
              dispatchConfirmState({ type: 'error', error: 'Nie udało się wczytać tego profilu.' });
              return;
            }

            if (preview.status === 'own_profile' || preview.status === 'own_invite') {
              dispatchConfirmState({ type: 'error', error: 'To jest Twój profil.' });
              return;
            }

            const mergedProfile: FriendProfile = {
              ...preview.profile,
              avatar_storage_path: preview.profile.avatar_storage_path ?? avatarStoragePath,
              avatar_emoji: preview.profile.avatar_emoji ?? avatarEmoji,
            };

            let nextAvatarUrl: string | null = null;
            if (mergedProfile.avatar_storage_path) {
              try {
                nextAvatarUrl = await createSignedAvatarUrl(mergedProfile.avatar_storage_path);
              } catch (err) {
                console.warn('Failed to load friend avatar signed URL', err);
              }
            }

            let nextRelationStatus: FriendInviteRelationStatus = 'none';
            try {
              nextRelationStatus = await getFriendInviteRelationStatus(preview.profile.id);
            } catch {
              nextRelationStatus = 'none';
            }

            dispatchConfirmState({
              type: 'loaded',
              friendProfile: mergedProfile,
              avatarUrl: nextAvatarUrl,
              relationStatus: nextRelationStatus,
            });
          } catch (err: unknown) {
            dispatchConfirmState({
              type: 'error',
              error: err instanceof Error ? err.message : 'Nie udało się wczytać profilu.',
            });
          }
        },
        () => {}
      );
    };

    const loadProfileDataId = setTimeout(() => {
      void loadProfileData();
    }, 0);

    return () => {
      clearTimeout(loadProfileDataId);
    };
  }, [profileId, token, avatarStoragePath, avatarEmoji]);

  const displayUsername = friendProfile?.username ?? username;
  const statusLine = relationStatusCopy(relationStatus);

  const primaryLabel = () =>
    relationStatus === 'incoming_pending' ? 'Zaakceptuj zaproszenie' : 'Dodaj znajomego';

  const handleSend = async () => {
    if (!profileId && !token) {
      notifyError('Brak danych', { message: 'Nie udało się odczytać profilu z kodu QR.' });
      return;
    }

    if (relationStatus === 'already_friends' || relationStatus === 'outgoing_pending') {
      return;
    }

    tap('heavy');
    dispatchConfirmState({ type: 'actionLoading', actionLoading: true });
    await runWithFinally(
      async () => {
        const result = token
          ? await redeemFriendInviteToken(token)
          : await sendFriendRequestByProfileQr(profileId ?? '');
        const resultCode = result.result;
        const resultProfile = 'inviterProfile' in result ? result.inviterProfile : result.profile;
        trackEvent('friend_invite_redeem', {
          channel: 'qr',
          status: 'success',
          result: resultCode,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
        void queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests });
        void queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests });
        const message = mapConfirmationMessage(resultCode, resultProfile?.username ?? displayUsername);
        switch (resultCode) {
          case 'request_sent':
          case 'already_friends':
          case 'accepted_reverse_request':
            notifySuccess('Potwierdzenie', { message });
            break;
          case 'already_requested':
            notifyInfo('Potwierdzenie', { message });
            break;
          case 'own_profile':
          case 'invalid_profile':
            notifyError('Potwierdzenie', { message });
            break;
          default:
            notifyShow({ title: 'Potwierdzenie', message });
        }
        onDismiss();
        router.replace('/(tabs)/profile');
      },
      () => dispatchConfirmState({ type: 'actionLoading', actionLoading: false })
    ).catch((err: unknown) => {
      trackEvent('friend_invite_redeem', {
        channel: 'qr',
        status: 'fail',
        errorCode: (err as { message?: string })?.message ?? 'unknown',
      });
      notifyError('Błąd', {
        message: (err as { message?: string })?.message ?? 'Nie udało się wysłać zaproszenia.',
      });
    });
  };

  if (loading) {
    return (
      <ActionSheetSurface
        title="Dodaj znajomego"
        message="Profil odczytany z kodu QR."
        nativeBottomSheet
      >
        <View style={styles.loaderContent}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={[styles.loaderLabel, { color: colors.textSecondary }]}>Ładowanie profilu…</Text>
        </View>
      </ActionSheetSurface>
    );
  }

  if (error) {
    return (
      <ActionSheetSurface
        title="Dodaj znajomego"
        message={error}
        nativeBottomSheet
        actions={<ActionSheetSecondaryButton label="Zamknij" onPress={onDismiss} />}
      />
    );
  }

  return (
    <ActionSheetSurface
      title="Dodaj znajomego"
      message="Profil odczytany z kodu QR. Dodanie wymaga akceptacji drugiej osoby."
      contentAlign="stretch"
      nativeBottomSheet
      actions={
        <>
          {(relationStatus === 'none' || relationStatus === 'incoming_pending') && (
            <ActionSheetPrimaryButton
              label={primaryLabel()}
              loading={actionLoading}
              onPress={handleSend}
            />
          )}
          <ActionSheetSecondaryButton
            label={relationStatus === 'already_friends' || relationStatus === 'outgoing_pending' ? 'Zamknij' : 'Anuluj'}
            onPress={onDismiss}
            disabled={actionLoading}
          />
        </>
      }
    >
      <View style={styles.avatarContainer}>
        <AvatarCircle
          size={ACTION_SHEET_AVATAR_SIZE}
          url={avatarUrl}
          storagePath={friendProfile?.avatar_storage_path}
          emoji={friendProfile?.avatar_emoji}
          fallbackInitial={displayUsername.charAt(0)}
        />
      </View>

      <Text style={[styles.handle, { color: colors.textPrimary }]} numberOfLines={1}>
        @{displayUsername || 'nieznany'}
      </Text>

      {statusLine ? (
        <View style={styles.statusBlock}>
          {relationStatus === 'already_friends' ? (
            <AppIcon name="checkCircle" size={APP_ICON_SIZE.xl} color={colors.success} />
          ) : relationStatus === 'outgoing_pending' ? (
            <AppIcon name="clock" size={APP_ICON_SIZE.lg} color={colors.textMuted} />
          ) : (
            <AppIcon name="personAdd" size={APP_ICON_SIZE.lg} color={colors.accent} />
          )}
          <Text
            style={[
              styles.statusLineText,
              { color: relationStatus === 'already_friends' ? colors.success : colors.textSecondary },
            ]}
          >
            {statusLine}
          </Text>
        </View>
      ) : null}
    </ActionSheetSurface>
  );
}

function mapConfirmationMessage(result: string, username?: string) {
  if (result === 'request_sent') return `Zaproszenie do @${username ?? 'użytkownika'} zostało wysłane.`;
  if (result === 'already_requested') return 'Zaproszenie zostało już wysłane wcześniej.';
  if (result === 'already_friends') return `Jesteście już znajomymi${username ? ` z @${username}` : ''}.`;
  if (result === 'accepted_reverse_request') return `Zaakceptowano zaproszenie od @${username ?? 'użytkownika'}.`;
  if (result === 'own_profile') return 'Nie możesz dodać samego siebie.';
  return 'Nie udało się wysłać zaproszenia.';
}

function relationStatusCopy(status: FriendInviteRelationStatus): string | null {
  if (status === 'already_friends') return 'Jesteście już znajomymi — nie musisz wysyłać zaproszenia.';
  if (status === 'outgoing_pending') return 'Zaproszenie do tej osoby czeka już na akceptację.';
  if (status === 'incoming_pending') return 'Ta osoba wysłała Ci zaproszenie — możesz je zaakceptować.';
  return null;
}

const createSheetStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loaderContent: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      minHeight: ACTION_SHEET_AVATAR_SIZE + 8,
      paddingVertical: 4,
    },
    loaderLabel: {
      fontSize: 15,
      fontFamily: APP_FONT_FAMILY,
    },
    avatarContainer: {
      alignItems: 'center',
      marginVertical: 4,
    },
    handle: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      fontFamily: APP_FONT_FAMILY,
      textAlign: 'center',
      letterSpacing: -0.2,
    },
    statusBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginTop: 2,
      marginBottom: 2,
      borderRadius: 14,
      backgroundColor: colors.secondarySystemFill,
    },
    statusLineText: {
      fontSize: 15,
      lineHeight: 21,
      fontFamily: APP_FONT_FAMILY,
      fontWeight: '500',
      textAlign: 'center',
      paddingHorizontal: 10,
    },
  });
