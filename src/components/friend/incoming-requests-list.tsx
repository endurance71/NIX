import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { IncomingFriendRequest } from '../../services/friendService';
import { ThemeColors } from '../../theme/colors';
import { APP_FONT_FAMILY } from '../../theme/typography';

type IncomingRequestsListProps = {
  requests: IncomingFriendRequest[];
  colors: ThemeColors;
  actionLoadingId: string | null;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  emptyText?: string;
};

export function IncomingRequestsList({
  requests,
  colors,
  actionLoadingId,
  onAccept,
  onReject,
  emptyText = 'Brak oczekujących zaproszeń.',
}: IncomingRequestsListProps) {
  if (requests.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>;
  }

  return (
    <View style={styles.list}>
      {requests.map((request) => {
        const loading = actionLoadingId === request.id;
        return (
          <View key={request.id} style={[styles.row, { borderBottomColor: colors.border }]}>
            <Text style={[styles.username, { color: colors.textPrimary }]}>@{request.requester.username}</Text>
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.acceptButton,
                  { backgroundColor: colors.success },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => onAccept(request.id)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.buttonPrimaryText} />
                ) : (
                  <Text style={[styles.acceptText, { color: colors.buttonPrimaryText }]}>Przyjmij</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.rejectButton,
                  { borderColor: colors.borderStrong },
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => onReject(request.id)}
                disabled={loading}
              >
                <Text style={[styles.rejectText, { color: colors.textSecondary }]}>Usuń</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  username: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  rejectText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: APP_FONT_FAMILY,
  },
});
