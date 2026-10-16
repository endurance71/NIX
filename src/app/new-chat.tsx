import { useCallback, useDeferredValue, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@expo/ui';
import { Button, HStack, Spacer, Text as SwiftText, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { ACCEPTED_FRIENDS_LIMIT, listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { queryKeys } from '../lib/queryKeys';
import { filterFriendProfiles } from '../lib/inboxSearch';
import { useAppTheme } from '../hooks/useAppTheme';
import { typography } from '../theme/typography';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { AppHost } from '../components/ui/app-host';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useAuth } from '../hooks/useAuth';
import { useSignedAvatarUrls } from '../hooks/useSignedAvatarUrls';
import { OfflineStatusBanner } from '../components/auth/OfflineStatusBanner';

const AVATAR_SIZE = 40;
const ROW_HORIZONTAL_PADDING = 20;
const AVATAR_GAP = 14;

type FriendRowProps = {
  avatarUrl: string | null;
  item: FriendProfile;
  onPress: (id: string) => void;
};

function FriendRow({ avatarUrl, item, onPress }: FriendRowProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const displayName = item.display_name?.trim();
  const label = displayName || (item.username ? `@${item.username}` : t('common.unknown'));
  // Second line tells apart two friends with the same display name.
  const secondLine = displayName && item.username ? `@${item.username}` : null;

  return (
    <Pressable
      accessibilityLabel={secondLine ? `${label}, ${secondLine}` : label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.profileRow,
        pressed && { backgroundColor: colors.systemFill },
      ]}
      onPress={() => onPress(item.id)}>
      <AvatarCircle
        size={AVATAR_SIZE}
        url={avatarUrl}
        storagePath={item.avatar_storage_path}
        emoji={item.avatar_emoji}
        fallbackInitial={label}
      />
      {/* iOS separators start at the text, not under the avatar. */}
      <View style={[styles.rowText, { borderBottomColor: colors.separator }]}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.label }]}>
          {label}
        </Text>
        {secondLine ? (
          <Text numberOfLines={1} style={[styles.username, { color: colors.secondaryLabel }]}>
            {secondLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Replaces the sheet with the chat in one navigation action (no dismiss + timer race). */
function openChat(peerId: string) {
  router.replace({ pathname: '/chat/[peerId]', params: { peerId } });
}

function openFriends() {
  router.dismissTo('/(tabs)/profile/friends');
}

/** Sheet chrome: Cancel + centered title, then the "To:" field — like a compose sheet in Messages. */
function NewChatHeader() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    // Full width from RN layout, height from the content (AppHost defaults to `flex: 1`, which
    // pushed the title into the middle of the sheet and collapsed Cancel onto it).
    <AppHost matchContents={{ vertical: true }} style={styles.header}>
      <ZStack modifiers={[frame({ maxWidth: Infinity }), padding({ horizontal: 16, top: 4 })]}>
        <SwiftText
          modifiers={[
            font({ design: 'rounded', textStyle: 'headline' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            accessibilityAddTraits(['isHeader']),
          ]}>
          {t('inbox.newChatTitle')}
        </SwiftText>
        <HStack spacing={0} modifiers={[frame({ maxWidth: Infinity })]}>
          <Button
            label={t('common.cancel')}
            onPress={() => router.back()}
            modifiers={[buttonStyle('borderless'), tint(colors.accentText)]}
          />
          <Spacer />
        </HStack>
      </ZStack>
    </AppHost>
  );
}

function SearchField({ onSearchChange }: { onSearchChange: (value: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={[styles.searchRow, { borderBottomColor: colors.separator }]}>
      <Text style={[styles.searchLabel, { color: colors.secondaryLabel }]} accessible={false}>
        {t('inbox.newChatSearchLabel')}
      </Text>
      <AppHost style={styles.searchField}>
        <TextInput
          placeholder={t('inbox.newChatSearchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onChangeText={onSearchChange}
          testID="new-chat-search"
        />
      </AppHost>
    </View>
  );
}

function StateMessage({
  text,
  actionLabel,
  onAction,
  busy,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyStateText, { color: colors.secondaryLabel }]}>{text}</Text>
      {actionLabel && onAction ? (
        busy ? (
          <ActivityIndicator color={colors.label} style={styles.stateAction} />
        ) : (
          <AppHost matchContents style={styles.stateAction}>
            <Button
              label={actionLabel}
              onPress={onAction}
              modifiers={[buttonStyle('borderedProminent'), controlSize('regular'), tint(colors.accent)]}
            />
          </AppHost>
        )
      ) : null}
    </View>
  );
}

export default function NewChatSheet() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const { colors } = useAppTheme();
  const { canUseNetworkSession } = useAuth();
  const stylesForTheme = createStyles(topContentInset, bottomContentInset);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const {
    data: profilesData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });
  const profiles = profilesData ?? [];
  const visibleProfiles = filterFriendProfiles(profiles, deferredSearch);

  useFocusEffect(
    useCallback(() => {
      if (!canUseNetworkSession) return;
      void queryClient.refetchQueries({
        queryKey: queryKeys.acceptedFriends,
        type: 'active',
        stale: true,
      });
    }, [canUseNetworkSession, queryClient])
  );

  const showInitialLoader = canUseNetworkSession && isLoading && profiles.length === 0;
  const avatarUrls = useSignedAvatarUrls(
    profiles.map((profile) => profile.avatar_storage_path),
    { enabled: canUseNetworkSession }
  );

  const renderItem = ({ item }: { item: FriendProfile }) => (
    <FriendRow
      item={item}
      avatarUrl={item.avatar_storage_path ? avatarUrls[item.avatar_storage_path] ?? null : null}
      onPress={openChat}
    />
  );

  const emptyState =
    !canUseNetworkSession && profilesData === undefined ? (
      <StateMessage text={t('root.offlineCacheMissing')} />
    ) : profiles.length > 0 ? (
      <StateMessage text={t('inbox.newChatSearchEmpty')} />
    ) : (
      <StateMessage
        text={t('inbox.newChatEmpty')}
        actionLabel={t('inbox.newChatAddFriend')}
        onAction={openFriends}
      />
    );

  return (
    <View style={stylesForTheme.container}>
      <NewChatHeader />
      <SearchField onSearchChange={setSearch} />
      <OfflineStatusBanner />

      {showInitialLoader ? (
        <ActivityIndicator
          color={colors.label}
          style={styles.loading}
          accessibilityLabel={t('common.loading')}
        />
      ) : isError && profiles.length === 0 ? (
        <StateMessage
          text={t('inbox.newChatLoadError')}
          actionLabel={t('inbox.retry')}
          onAction={() => void refetch()}
          busy={isFetching}
        />
      ) : (
        <View style={styles.listWrap}>
          <FlashList
            data={visibleProfiles}
            extraData={avatarUrls}
            getItemType={() => 'friend-chat'}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={stylesForTheme.listContent}
            ListEmptyComponent={emptyState}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: ROW_HORIZONTAL_PADDING,
    gap: AVATAR_GAP,
  },
  rowText: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingRight: ROW_HORIZONTAL_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  name: {
    ...typography.body,
    fontWeight: '500',
  },
  username: {
    ...typography.footnote,
  },
  header: {
    alignSelf: 'stretch',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: ROW_HORIZONTAL_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchLabel: {
    ...typography.body,
  },
  searchField: {
    flex: 1,
    height: 44,
  },
  loading: {
    marginTop: 20,
  },
  listWrap: {
    flex: 1,
    width: '100%',
  },
  emptyState: {
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
    gap: 16,
  },
  emptyStateText: {
    ...typography.callout,
    textAlign: 'center',
  },
  stateAction: {
    alignSelf: 'center',
  },
});

const createStyles = (paddingTop: number, bottomInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingTop,
    },
    listContent: {
      paddingBottom: Math.max(bottomInset, 12),
    },
  });
