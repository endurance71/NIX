import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { sentLifecycleSegments } from '../../../lib/snapInboxLabels';
import { fetchInboxSnaps, fetchSentSnaps, flushCleanupQueue, type InboxSnap } from '../../../services/snapService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../../../lib/queryKeys';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { setInboxBadgeCount } from '../../../lib/inboxBadgeStore';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../../../services/avatarService';
import { typography } from '../../../theme/typography';
import { buildInboxThreads, type InboxThreadItem } from '../../../lib/inboxThreads';
import {
  acceptFriendRequest,
  listIncomingFriendRequests,
  rejectFriendRequest,
} from '../../../services/friendService';
import { SFSymbol } from '../../../components/ui/sf-symbol';
import { AvatarCircle } from '../../../components/ui/avatar-circle';
import { Host, List, Section, Text, Button, RNHostView } from '@expo/ui/swift-ui';
import {
  foregroundStyle,
  font,
  listStyle,
  padding,
  refreshable,
  listRowSeparator,
} from '@expo/ui/swift-ui/modifiers';

async function fetchInboxSnapsBundle() {
  void flushCleanupQueue().catch(() => {});
  const [inboxData, sentData] = await Promise.all([fetchInboxSnaps(), fetchSentSnaps()]);
  return { inboxData, sentData };
}

type ThreadRowProps = {
  avatarUrls: Record<string, string>;
  colors: ReturnType<typeof useAppTheme>['colors'];
  item: InboxThreadItem;
  onOpenSnap: (snap: InboxSnap) => void;
};

const ThreadRow = memo(function ThreadRow({ avatarUrls, colors, item, onOpenSnap }: ThreadRowProps) {
  if (item.direction === 'received') {
    const snap = item.snap;
    const isNew = !snap.is_viewed;
    const avatarPath = snap.sender?.avatar_storage_path ?? null;
    const avatarUrl = avatarPath ? avatarUrls[avatarPath] : null;
    const fallback = snap.sender?.username?.charAt(0).toUpperCase() || '?';

    return (
      <RNHostView matchContents>
        <Pressable
          accessibilityLabel={`Otwórz snap od @${snap.sender?.username || 'nieznanego użytkownika'}`}
          accessibilityRole="button"
          disabled={!isNew}
          onPress={() => onOpenSnap(snap)}
          style={({ pressed }) => [
            styles.rowInner,
            pressed && styles.rowPressed,
            !isNew && styles.rowDisabled,
          ]}>
          <AvatarCircle
            size={44}
            url={avatarUrl}
            storagePath={avatarPath}
            emoji={snap.sender?.avatar_emoji}
            fallbackInitial={fallback}
          />
          <View style={styles.rowTextBlock}>
            <RNText
              numberOfLines={1}
              style={[
                styles.peerTitle,
                { color: colors.label },
                !isNew && { color: colors.secondaryLabel, fontWeight: '400' },
              ]}>
              @{snap.sender?.username || 'Nieznany'}
            </RNText>
            <RNText
              numberOfLines={1}
              style={[styles.peerSubtitle, { color: isNew ? colors.destructive : colors.tertiaryLabel }]}>
              {isNew ? 'Nowy snap' : 'Otwarto'} •{' '}
              {new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </RNText>
          </View>
          {isNew ? <SFSymbol name="chevron.right" size={14} tintColor={colors.tertiaryLabel} /> : null}
        </Pressable>
      </RNHostView>
    );
  }

  const sent = item.snap;
  const avatarPath = sent.receiver?.avatar_storage_path ?? null;
  const avatarUrl = avatarPath ? avatarUrls[avatarPath] : null;
  const timeStr = new Date(sent.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sentSubtitle = ['Wysłane', ...sentLifecycleSegments(sent), timeStr].join(' • ');
  const fallback = sent.receiver?.username?.charAt(0).toUpperCase() || '?';

  return (
    <RNHostView matchContents>
      <View
        style={styles.rowInner}
        accessibilityLabel={`Wysłano do @${sent.receiver?.username || 'nieznanego użytkownika'}`}>
        <AvatarCircle
          size={44}
          url={avatarUrl}
          storagePath={avatarPath}
          emoji={sent.receiver?.avatar_emoji}
          fallbackInitial={fallback}
        />
        <View style={styles.rowTextBlock}>
          <RNText numberOfLines={1} style={[styles.peerTitle, { color: colors.label }]}>
            @{sent.receiver?.username || 'Nieznany'}
          </RNText>
          <RNText numberOfLines={1} style={[styles.peerSubtitle, { color: colors.tertiaryLabel }]}>
            {sentSubtitle}
          </RNText>
        </View>
      </View>
    </RNHostView>
  );
});

export default function InboxScreen() {
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();

  const { data: snapsBundle, isPending: snapsPending } = useQuery({
    queryKey: queryKeys.inboxSnapsBundle,
    queryFn: fetchInboxSnapsBundle,
  });

  const { data: requests = [], isPending: requestsPending } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
  });

  const snaps = useMemo(() => snapsBundle?.inboxData ?? [], [snapsBundle?.inboxData]);
  const sentSnaps = useMemo(() => snapsBundle?.sentData ?? [], [snapsBundle?.sentData]);
  const loading = snapsPending || requestsPending;
  const [feedback, setFeedback] = useState<string | null>(null);

  const feed = useMemo(() => buildInboxThreads(snaps, sentSnaps), [snaps, sentSnaps]);

  const sortedAvatarPaths = useMemo(() => {
    const paths = feed
      .map((item) =>
        item.direction === 'received' ? item.snap.sender?.avatar_storage_path : item.snap.receiver?.avatar_storage_path
      )
      .filter((path): path is string => Boolean(path));
    return Array.from(new Set(paths)).sort();
  }, [feed]);

  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(sortedAvatarPaths),
    queryFn: () => createSignedAvatarUrls(sortedAvatarPaths),
    enabled: sortedAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  useEffect(() => {
    if (snapsPending) return;
    setInboxBadgeCount(snaps.filter((snap) => snap.is_viewed !== true).length);
  }, [snaps, snapsPending]);

  const invalidateInboxQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
    ]);
  }, [queryClient]);

  const refetchInboxIfStale = useCallback(() => {
    void queryClient.refetchQueries({
      type: 'active',
      predicate: (query) => {
        const key = query.queryKey[0];
        if (key !== queryKeys.inboxSnapsBundle[0] && key !== queryKeys.incomingFriendRequests[0]) return false;
        return query.isStale();
      },
    });
  }, [queryClient]);

  const refetchInboxForce = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.inboxSnapsBundle, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
      ]);
    } catch (err) {
      console.error('Failed to refresh inbox', err);
    }
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refetchInboxIfStale();
    }, [refetchInboxIfStale])
  );

  const handleOpenSnap = useCallback((snap: InboxSnap) => {
    if (snap.is_viewed) return;
    router.push({
      pathname: '/viewer',
      params: { id: snap.id, path: snap.media_path, senderId: snap.sender_id },
    });
  }, []);

  const handleAccept = async (requestId: string) => {
    setFeedback(null);
    try {
      await acceptFriendRequest(requestId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
      await invalidateInboxQueries();
      setFeedback('Zaproszenie zaakceptowane.');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Nie udało się zaakceptować zaproszenia.');
    }
  };

  const handleReject = async (requestId: string) => {
    setFeedback(null);
    try {
      await rejectFriendRequest(requestId);
      await invalidateInboxQueries();
      setFeedback('Zaproszenie usunięte.');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Nie udało się usunąć zaproszenia.');
    }
  };

  if (loading && feed.length === 0) {
    return (
      <Host style={[styles.container, styles.centered]} colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
        <StatusBar style={statusBarStyle} />
        <ActivityIndicator color={colors.label} />
      </Host>
    );
  }

  return (
    <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
      <List modifiers={[listStyle('insetGrouped'), padding({ top: 0 }), refreshable(refetchInboxForce)]}>
        {requests.length > 0 ? (
          <Section title={`Zaproszenia (${requests.length})`}>
            {requests.map((request) => (
              <RNHostView matchContents key={request.id}>
                <View style={styles.requestRow}>
                  <RNText numberOfLines={1} style={[styles.peerTitle, { color: colors.label }]}>
                    @{request.requester.username}
                  </RNText>
                  <View style={styles.requestActions}>
                    <Button label="Przyjmij" onPress={() => handleAccept(request.id)} />
                    <Button label="Usuń" onPress={() => handleReject(request.id)} role="destructive" />
                  </View>
                </View>
              </RNHostView>
            ))}
          </Section>
        ) : null}

        <Section title={`Wiadomości (${feed.length})`}>
          {feed.length === 0 ? (
            <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), listRowSeparator('hidden')]}>
              Brak wiadomości.
            </Text>
          ) : (
            feed.map((threadItem) => (
              <ThreadRow
                key={threadItem.id}
                item={threadItem}
                avatarUrls={avatarUrls}
                colors={colors}
                onOpenSnap={handleOpenSnap}
              />
            ))
          )}
        </Section>

        {feedback ? (
          <Section>
            <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 13, design: 'rounded' })]}>
              {feedback}
            </Text>
          </Section>
        ) : null}
      </List>
      <Stack.Screen.Title large>Skrzynka</Stack.Screen.Title>
    </Host>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestRow: {
    gap: 8,
    paddingVertical: 6,
  },
  requestActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowInner: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowDisabled: {
    opacity: 0.82,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  peerTitle: {
    ...typography.headline,
  },
  peerSubtitle: {
    ...typography.footnote,
  },
});
