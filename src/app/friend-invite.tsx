import { useEffect, useReducer } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { APP_FONT_FAMILY } from '../theme/typography';
import {
  redeemFriendInviteToken,
  sendFriendRequestByProfileQr,
  type RedeemInviteResult,
  type SendFriendRequestResult,
} from '../services/friendService';
import { trackEvent } from '../lib/telemetry';
import { NativeScreen } from '../components/ui/native-screen';
import { NativeSectionCard } from '../components/ui/native-section-card';
import { NativeButton } from '../components/ui/native-button';

function mapResultMessage(result: RedeemInviteResult | SendFriendRequestResult | 'own_profile' | 'invalid_profile', username?: string) {
  if (result === 'request_sent') return `Zaproszenie do @${username ?? 'użytkownika'} zostało wysłane.`;
  if (result === 'already_requested') return 'Zaproszenie zostało już wysłane wcześniej.';
  if (result === 'already_friends') return `Jesteście już znajomymi${username ? ` z @${username}` : ''}.`;
  if (result === 'accepted_reverse_request') return `Zaakceptowano zaproszenie od @${username ?? 'użytkownika'}.`;
  if (result === 'own_invite') return 'Nie możesz dodać samego siebie.';
  if (result === 'own_profile') return 'Nie możesz dodać samego siebie.';
  if (result === 'invalid_profile') return 'Kod profilu jest nieprawidłowy.';
  return 'Zaproszenie jest nieprawidłowe, wygasłe lub już użyte.';
}

type InviteState = { loading: boolean; message: string | null };

type InviteAction =
  | { type: 'missing_payload' }
  | { type: 'done'; message: string };

function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  switch (action.type) {
    case 'missing_payload':
      return { loading: false, message: 'Brak danych zaproszenia.' };
    case 'done':
      return { loading: false, message: action.message };
    default:
      return state;
  }
}

export default function FriendInviteScreen() {
  const { token, profileId } = useLocalSearchParams<{ token?: string; profileId?: string }>();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [{ loading, message }, dispatch] = useReducer(inviteReducer, {
    loading: true,
    message: null,
  });

  useEffect(() => {
    const run = async () => {
      if (!token && !profileId) {
        trackEvent('friend_invite_redeem', {
          channel: 'deeplink',
          status: 'fail',
          errorCode: 'missing_payload',
        });
        dispatch({ type: 'missing_payload' });
        return;
      }
      try {
        if (profileId) {
          const result = await sendFriendRequestByProfileQr(profileId);
          dispatch({
            type: 'done',
            message: mapResultMessage(result.result, result.profile?.username),
          });
          trackEvent('friend_invite_redeem', {
            channel: 'deeplink',
            status: 'success',
            result: result.result,
          });
          return;
        }

        const result = await redeemFriendInviteToken(token as string);
        dispatch({
          type: 'done',
          message: mapResultMessage(result.result, result.inviterProfile?.username),
        });
        trackEvent('friend_invite_redeem', {
          channel: 'deeplink',
          status: 'success',
          result: result.result,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Nie udało się zrealizować zaproszenia.';
        dispatch({ type: 'done', message: msg });
        trackEvent('friend_invite_redeem', {
          channel: 'deeplink',
          status: 'fail',
          errorCode: err instanceof Error ? err.message : 'unknown',
        });
      }
    };
    void run();
  }, [token, profileId]);

  return (
    <NativeScreen scroll>
      <NativeSectionCard title="Zaproszenie znajomego" subtitle="Wynik dodawania kontaktu z linku.">
        {loading ? (
          <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 16 }} />
        ) : (
          <Text style={styles.message}>{message ?? 'Brak danych.'}</Text>
        )}
        <NativeButton label="Przejdź do profilu" onPress={() => router.replace('/profile')} />
      </NativeSectionCard>
    </NativeScreen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    message: {
      color: colors.textSecondary,
      fontSize: 15,
      fontFamily: APP_FONT_FAMILY,
      lineHeight: 22,
    },
  });
