import { useCallback, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { useAppTheme } from '../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../theme/typography';
import {
  FriendInviteRelationStatus,
  FriendProfile,
  getFriendInviteRelationStatus,
  previewProfileQr,
  sendFriendRequestByProfileQr,
} from '../services/friendService';
import { createSignedAvatarUrl } from '../services/avatarService';
import { trackEvent } from '../lib/telemetry';
import { queryKeys } from '../lib/queryKeys';
import { NativeButton } from '../components/ui/native-button';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { AppIcon } from '../components/ui/app-icon';
import { notifyError, notifyInfo, notifyShow, notifySuccess } from '../lib/appNotify';
import { runWithFinally } from '../lib/runWithFinally';

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

function paramFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function FriendInviteConfirmScreen() {
  const queryClient = useQueryClient();
  const rawParams = useLocalSearchParams<{
    profileId?: string;
    username?: string;
    avatarStoragePath?: string;
    avatarEmoji?: string;
  }>();
  const profileId = paramFirst(rawParams.profileId);
  const usernameParam = paramFirst(rawParams.username);
  const avatarStoragePathParam = paramFirst(rawParams.avatarStoragePath);
  const avatarEmojiParam = paramFirst(rawParams.avatarEmoji);
  const { colors } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const styles = createStyles(colors, topContentInset, bottomContentInset);

  const [state, dispatch] = useReducer(
    (
      current: {
        friendProfile: FriendProfile | null;
        avatarUrl: string | null;
        profileLoading: boolean;
        profileError: string | null;
        relationStatus: FriendInviteRelationStatus;
        actionLoading: boolean;
      },
      action:
        | {
            type: 'reset_for_loading';
          }
        | {
            type: 'profile_loaded';
            friendProfile: FriendProfile;
            avatarUrl: string | null;
            relationStatus: FriendInviteRelationStatus;
          }
        | { type: 'profile_error'; profileError: string }
        | { type: 'set_action_loading'; actionLoading: boolean }
    ) => {
      switch (action.type) {
        case 'reset_for_loading':
          return {
            ...current,
            profileLoading: true,
            profileError: null,
            friendProfile: null,
            avatarUrl: null,
            relationStatus: 'none' as FriendInviteRelationStatus,
          };
        case 'profile_loaded':
          return {
            ...current,
            friendProfile: action.friendProfile,
            avatarUrl: action.avatarUrl,
            relationStatus: action.relationStatus,
            profileLoading: false,
            profileError: null,
          };
        case 'profile_error':
          return {
            ...current,
            profileLoading: false,
            profileError: action.profileError,
            friendProfile: null,
            avatarUrl: null,
            relationStatus: 'none' as FriendInviteRelationStatus,
          };
        case 'set_action_loading':
          return {
            ...current,
            actionLoading: action.actionLoading,
          };
        default:
          return current;
      }
    },
    {
      friendProfile: null,
      avatarUrl: null,
      profileLoading: true,
      profileError: null,
      relationStatus: 'none',
      actionLoading: false,
    }
  );
  const { friendProfile, avatarUrl, profileLoading, profileError, relationStatus, actionLoading } = state;

  useFocusEffect(
    useCallback(() => {
      if (!profileId) {
        dispatch({ type: 'profile_error', profileError: 'Brak ID profilu.' });
        return;
      }

      let cancelled = false;

      const loadProfile = async () => {
        dispatch({ type: 'reset_for_loading' });

        try {
          const preview = await previewProfileQr(profileId);
          if (cancelled) return;

          if (preview.status === 'invalid_profile' || !preview.profile) {
            dispatch({ type: 'profile_error', profileError: 'Nie udało się wczytać tego profilu.' });
            return;
          }

          if (preview.status === 'own_profile') {
            dispatch({ type: 'profile_error', profileError: 'To jest Twój profil.' });
            return;
          }

          const fallbackAvatarPath = avatarStoragePathParam ?? null;
          const fallbackAvatarEmoji = avatarEmojiParam ?? null;
          const mergedProfile: FriendProfile = {
            ...preview.profile,
            avatar_storage_path: preview.profile.avatar_storage_path ?? fallbackAvatarPath,
            avatar_emoji: preview.profile.avatar_emoji ?? fallbackAvatarEmoji,
          };

          let nextAvatarUrl: string | null = null;
          const path = mergedProfile.avatar_storage_path;
          if (path) {
            nextAvatarUrl = await createSignedAvatarUrl(path);
          }

          let nextRelationStatus: FriendInviteRelationStatus = 'none';
          try {
            const rel = await getFriendInviteRelationStatus(preview.profile.id);
            nextRelationStatus = rel;
          } catch {
            nextRelationStatus = 'none';
          }
          if (cancelled) return;
          dispatch({
            type: 'profile_loaded',
            friendProfile: mergedProfile,
            avatarUrl: nextAvatarUrl,
            relationStatus: nextRelationStatus,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Nie udało się wczytać profilu.';
          if (!cancelled) dispatch({ type: 'profile_error', profileError: message });
        }
      };

      void loadProfile();
      return () => {
        cancelled = true;
      };
    }, [avatarEmojiParam, avatarStoragePathParam, profileId])
  );

  const displayUsername =
    friendProfile?.username ??
    usernameParam ??
    '';

  const statusLine = relationStatusCopy(relationStatus);

  const primaryLabel = () =>
    relationStatus === 'incoming_pending' ? 'Zaakceptuj zaproszenie' : 'Dodaj znajomego';

  const handleSend = async () => {
    if (!profileId) {
      notifyError('Brak danych', { message: 'Nie udało się odczytać profilu z kodu QR.' });
      return;
    }

    if (relationStatus === 'already_friends' || relationStatus === 'outgoing_pending') {
      return;
    }

    dispatch({ type: 'set_action_loading', actionLoading: true });
    await runWithFinally(
      async () => {
        const result = await sendFriendRequestByProfileQr(profileId);
        trackEvent('friend_invite_redeem', {
          channel: 'qr',
          status: 'success',
          result: result.result,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
        void queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests });
        void queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests });
        const message = mapConfirmationMessage(result.result, result.profile?.username ?? displayUsername);
        switch (result.result) {
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
        router.back();
      },
      () => dispatch({ type: 'set_action_loading', actionLoading: false })
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

  /** fitToContents na iOS uwzględnia dolny inset — stały, mały padding treści */
  const bottomPad = 10;
  const rootFillHeight = profileLoading || !!profileError;

  return (
    <View style={rootFillHeight ? styles.screenRootFill : styles.screenRootHug}>
      {profileLoading ? (
        <View style={[styles.loaderWrap, styles.loaderWrapWithInsets, { paddingBottom: bottomPad + 8 }]}>
          <ActivityIndicator color={colors.textPrimary} />
          <Text style={[styles.loaderLabel, { color: colors.textSecondary }]}>Ładowanie profilu…</Text>
        </View>
      ) : profileError ? (
        <View style={[styles.loaderWrap, { paddingBottom: bottomPad }]}>
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{profileError}</Text>
          <NativeButton label="Zamknij" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <View style={[styles.container, { paddingBottom: bottomPad }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Dodaj znajomego</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            Profil odczytany z kodu QR. Dodanie wymaga akceptacji drugiej osoby.
          </Text>

          <View style={{ alignSelf: 'center', marginVertical: 4 }}>
            <AvatarCircle
              size={96}
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
                <AppIcon name="checkCircle" size={22} color={colors.success} />
              ) : relationStatus === 'outgoing_pending' ? (
                <AppIcon name="clock" size={20} color={colors.textMuted} />
              ) : (
                <AppIcon name="personAdd" size={20} color={colors.accent} />
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

          {(relationStatus === 'none' || relationStatus === 'incoming_pending') && (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.buttonPrimaryBg },
                pressed && styles.pressed,
                actionLoading && styles.primaryDisabled,
              ]}
              onPress={handleSend}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={colors.buttonPrimaryText} />
              ) : (
                <Text style={[styles.primaryLabel, { color: colors.buttonPrimaryText }]}>{primaryLabel()}</Text>
              )}
            </Pressable>
          )}

          <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]} onPress={() => router.back()} disabled={actionLoading}>
            <Text style={[styles.cancelLabel, { color: colors.accent }]}>
              {relationStatus === 'already_friends' || relationStatus === 'outgoing_pending' ? 'Zamknij' : 'Anuluj'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  paddingTop: number,
  paddingBottom: number
) =>
  StyleSheet.create({
    /** Ładowanie / błąd — wyśrodkowanie na dostępnej wysokości */
    screenRootFill: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    /** Treść arkusza — bez flex:1, żeby fitToContents nie zostawiał pustki pod przyciskami */
    screenRootHug: {
      alignSelf: 'stretch',
      flexGrow: 0,
      backgroundColor: 'transparent',
    },
    loaderWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 16,
      backgroundColor: 'transparent',
    },
    loaderWrapWithInsets: {
      paddingTop,
    },
    loaderLabel: {
      fontSize: 15,
      fontFamily: APP_FONT_FAMILY,
    },
    errorText: {
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      fontFamily: APP_FONT_FAMILY,
      marginBottom: 8,
    },
    container: {
      width: '96%',
      alignSelf: 'center',
      paddingHorizontal: 22,
      paddingTop,
      paddingBottom: Math.max(paddingBottom, 14),
      backgroundColor: 'transparent',
      gap: 12,
    },
    title: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      textAlign: 'center',
      fontFamily: APP_FONT_FAMILY,
      paddingHorizontal: 12,
    },
    message: {
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      fontFamily: APP_FONT_FAMILY,
      marginBottom: 2,
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
      alignItems: 'center',
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
    primaryButton: {
      borderRadius: 16,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginTop: 4,
    },
    primaryLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      fontFamily: APP_FONT_FAMILY,
    },
    primaryDisabled: {
      opacity: 0.85,
    },
    cancelButton: {
      paddingTop: 4,
      paddingBottom: 0,
      marginBottom: 0,
      alignItems: 'center',
    },
    cancelLabel: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '500',
      fontFamily: APP_FONT_FAMILY,
    },
    pressed: {
      opacity: 0.65,
    },
  });
