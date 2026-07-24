import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { tap } from '../lib/haptics';

type FriendRowProps = {
  avatarUrl: string | null;
  item: FriendProfile;
  onPress: (id: string) => void;
};

function FriendRow({ avatarUrl, item, onPress }: FriendRowProps) {
  const { colors } = useAppTheme();
  const label = item.display_name
    ? item.display_name
    : item.username
      ? `@${item.username}`
      : 'Nieznany';

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.profileRow,
        { borderBottomColor: colors.separator },
        pressed && styles.profileRowPressed,
      ]}
      onPress={() => onPress(item.id)}>
      <View style={styles.avatarWrap}>
        <AvatarCircle
          size={40}
          url={avatarUrl}
          storagePath={item.avatar_storage_path}
          emoji={item.avatar_emoji}
          fallbackInitial={item.username?.charAt(0)}
        />
      </View>
      <Text numberOfLines={1} style={[styles.username, { color: colors.label }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function openChat(peerId: string) {
  tap('light');
  router.dismiss();
  setTimeout(() => {
    router.push({ pathname: '/chat/[peerId]', params: { peerId } });
  }, 50);
}

export default function NewChatSheet() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const { colors } = useAppTheme();
  const stylesForTheme = createStyles(colors, topContentInset, bottomContentInset);

  const {
    data: profiles = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 50 }),
    staleTime: 1000 * 60 * 2,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({
        queryKey: queryKeys.acceptedFriends,
        type: 'active',
        stale: true,
      });
    }, [queryClient])
  );

  const showInitialLoader = isLoading && profiles.length === 0;
  const paths = profiles.flatMap((p) => (p.avatar_storage_path ? [p.avatar_storage_path] : []));
  const sortedFriendAvatarPaths = Array.from(new Set(paths)).sort();

  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(sortedFriendAvatarPaths),
    queryFn: () => createSignedAvatarUrls(sortedFriendAvatarPaths),
    enabled: sortedFriendAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  const renderItem = ({ item }: { item: FriendProfile }) => (
    <FriendRow
      item={item}
      avatarUrl={item.avatar_storage_path ? avatarUrls[item.avatar_storage_path] ?? null : null}
      onPress={openChat}
    />
  );

  return (
    <View style={stylesForTheme.container}>
      <Text style={stylesForTheme.title}>{t('inbox.newChatTitle')}</Text>
      <Text style={stylesForTheme.subtitle}>{t('inbox.newChatSubtitle')}</Text>

      {showInitialLoader ? (
        <ActivityIndicator color={colors.label} style={styles.loading} />
      ) : isError ? (
        <View style={stylesForTheme.emptyState}>
          <Text style={stylesForTheme.emptyStateText}>{t('inbox.newChatLoadError')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('inbox.retry')}
            onPress={() => void refetch()}
            style={styles.retryButton}
            disabled={isFetching}>
            {isFetching ? (
              <ActivityIndicator color={colors.label} />
            ) : (
              <Text style={[styles.retryButtonText, { color: colors.systemBlue }]}>
                {t('inbox.retry')}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={stylesForTheme.listWrap}>
          <FlashList
            data={profiles}
            extraData={avatarUrls}
            // @ts-expect-error - estimatedItemSize type issue
            estimatedItemSize={64}
            getItemType={() => 'friend-chat'}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={stylesForTheme.listContent}
            ListEmptyComponent={
              <View style={stylesForTheme.emptyState}>
                <Text style={stylesForTheme.emptyStateText}>{t('inbox.newChatEmpty')}</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileRowPressed: {
    opacity: 0.72,
  },
  avatarWrap: {
    marginRight: 16,
  },
  username: {
    ...typography.callout,
    flex: 1,
    fontWeight: '500',
  },
  loading: {
    marginTop: 20,
  },
  retryButton: {
    marginTop: 16,
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  retryButtonText: {
    ...typography.headline,
  },
});

const createStyles = (colors: ThemeColors, paddingTop: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingTop,
    },
    listContent: {
      paddingBottom: Math.max(bottomInset, 12),
    },
    title: {
      ...typography.title2,
      color: colors.label,
      textAlign: 'center',
      paddingHorizontal: 22,
    },
    subtitle: {
      ...typography.footnote,
      marginTop: 6,
      marginBottom: 12,
      textAlign: 'center',
      color: colors.tertiaryLabel,
      paddingHorizontal: 22,
    },
    listWrap: {
      flex: 1,
      width: '100%',
      marginTop: 10,
    },
    emptyState: {
      paddingHorizontal: 24,
      paddingTop: paddingTop,
    },
    emptyStateText: {
      ...typography.callout,
      color: colors.tertiaryLabel,
      textAlign: 'center',
    },
  });
