import { useDeferredValue, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SymbolView } from 'expo-symbols';
import { TextInput } from '@expo/ui';
import { Button, HStack, Spacer, Text as SwiftText, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  buttonStyle,
  disabled as swiftDisabled,
  bold,
  font,
  foregroundStyle,
  frame,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { ACCEPTED_FRIENDS_LIMIT, listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { enqueueTextOutbox, flushTextOutbox } from '../services/textOutboxService';
import { queryKeys } from '../lib/queryKeys';
import { filterFriendProfiles } from '../lib/inboxSearch';
import { notifyDomainError, notifySuccess } from '../lib/appNotify';
import { selection } from '../lib/haptics';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAuth } from '../hooks/useAuth';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { useSignedAvatarUrls } from '../hooks/useSignedAvatarUrls';
import { typography } from '../theme/typography';
import { APP_ICON_SIZE, resolveAppIconName } from '../theme/app-icons';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { AppHost } from '../components/ui/app-host';
import { OfflineStatusBanner } from '../components/auth/OfflineStatusBanner';
import type { TextMessage } from '../types/database.types';

const AVATAR_SIZE = 40;
const ROW_HORIZONTAL_PADDING = 20;
const AVATAR_GAP = 14;

function newClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function FriendRow({
  item,
  avatarUrl,
  selected,
  onToggle,
}: {
  item: FriendProfile;
  avatarUrl: string | null;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const displayName = item.display_name?.trim();
  const label = displayName || (item.username ? `@${item.username}` : t('common.unknown'));
  const secondLine = displayName && item.username ? `@${item.username}` : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={secondLine ? `${label}, ${secondLine}` : label}
      accessibilityState={{ selected }}
      onPress={() => onToggle(item.id)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.systemFill }]}>
      <AvatarCircle
        size={AVATAR_SIZE}
        url={avatarUrl}
        storagePath={item.avatar_storage_path}
        emoji={item.avatar_emoji}
        fallbackInitial={item.username?.charAt(0)}
      />
      <View style={[styles.rowText, { borderBottomColor: colors.separator }]}>
        <View style={styles.rowLabels}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.label }]}>
            {label}
          </Text>
          {secondLine ? (
            <Text numberOfLines={1} style={[styles.username, { color: colors.secondaryLabel }]}>
              {secondLine}
            </Text>
          ) : null}
        </View>
        {/* Selection like a List in edit mode: filled check when chosen, an empty ring otherwise. */}
        <SymbolView
          name={resolveAppIconName(selected ? 'checkCircleFill' : 'circle')}
          size={APP_ICON_SIZE.xl}
          tintColor={selected ? colors.accentText : colors.tertiaryLabel}
          weight="regular"
        />
      </View>
    </Pressable>
  );
}

/** Cancel · title · Send, like a compose sheet in Messages. */
function ForwardHeader({ canSend, onSend }: { canSend: boolean; onSend: () => void }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <AppHost matchContents={{ vertical: true }} style={styles.header}>
      <ZStack modifiers={[frame({ maxWidth: Infinity }), padding({ horizontal: 16, top: 4 })]}>
        <SwiftText
          modifiers={[
            font({ design: 'rounded', textStyle: 'headline' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            accessibilityAddTraits(['isHeader']),
          ]}>
          {t('forward.title')}
        </SwiftText>
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Button
            label={t('common.cancel')}
            onPress={() => router.back()}
            modifiers={[buttonStyle('borderless'), tint(colors.accentText)]}
          />
          <Spacer />
          <Button
            label={t('forward.send')}
            onPress={onSend}
            modifiers={[
              buttonStyle('borderless'),
              bold(),
              tint(colors.accentText),
              swiftDisabled(!canSend),
            ]}
          />
        </HStack>
      </ZStack>
    </AppHost>
  );
}

/** The forwarded text, quoted the way it will arrive. */
function ForwardPreview({ body }: { body: string }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.preview, { backgroundColor: colors.secondarySystemFill }]}
      accessible
      accessibilityLabel={t('forward.previewA11y', { text: body })}>
      <Text numberOfLines={3} style={[styles.previewText, { color: colors.label }]}>
        {body}
      </Text>
    </View>
  );
}

/**
 * „Przekaż dalej”: sends a copy of a chat text to one or more friends through the same encrypted
 * outbox as a typed message (so it is moderated and retried like any other text).
 */
export default function ForwardMessageSheet() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const { peerId, messageId } = useLocalSearchParams<{ peerId?: string; messageId?: string }>();
  const { session, canUseNetworkSession } = useAuth();
  const currentUserId = session?.user?.id ?? '';
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [sending, setSending] = useState(false);

  // The message comes from the open chat's cache: nothing private travels in the route.
  const message = peerId
    ? queryClient
        .getQueryData<TextMessage[]>(queryKeys.textMessagesWithPeer(peerId))
        ?.find((candidate) => candidate.id === messageId)
    : undefined;
  const body = message?.body.trim() ?? '';

  const friendsQuery = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: ACCEPTED_FRIENDS_LIMIT }),
    enabled: canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });
  const friends = friendsQuery.data ?? [];
  const visibleFriends = filterFriendProfiles(friends, deferredSearch);
  const avatarUrls = useSignedAvatarUrls(
    friends.map((friend) => friend.avatar_storage_path),
    { enabled: canUseNetworkSession },
  );

  const toggle = (id: string) => {
    selection();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!body || selected.size === 0 || sending || !currentUserId) return;
    setSending(true);
    const recipients = [...selected];
    try {
      for (const recipientId of recipients) {
        await enqueueTextOutbox(currentUserId, recipientId, body, newClientMessageId());
      }
      notifySuccess(t('forward.sent', { count: recipients.length }));
      router.back();
      void flushTextOutbox(currentUserId)
        .catch(() => undefined)
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: ['textOutbox'] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });
          void queryClient.invalidateQueries({ queryKey: queryKeys.inboxActivityBundle });
        });
    } catch (error) {
      notifyDomainError(error, t('forward.failure'));
      setSending(false);
    }
  };

  if (!body) {
    return (
      <View style={[styles.container, { paddingTop: topContentInset }]}>
        <ForwardHeader canSend={false} onSend={() => undefined} />
        <Text style={[styles.stateText, { color: colors.secondaryLabel }]}>{t('forward.unavailable')}</Text>
      </View>
    );
  }

  const emptyState =
    !canUseNetworkSession && friendsQuery.data === undefined ? (
      <Text style={[styles.stateText, { color: colors.secondaryLabel }]}>{t('root.offlineCacheMissing')}</Text>
    ) : friends.length > 0 ? (
      <Text style={[styles.stateText, { color: colors.secondaryLabel }]}>{t('inbox.newChatSearchEmpty')}</Text>
    ) : (
      <Text style={[styles.stateText, { color: colors.secondaryLabel }]}>{t('forward.empty')}</Text>
    );

  return (
    <View style={[styles.container, { paddingTop: topContentInset }]}>
      <ForwardHeader canSend={selected.size > 0 && !sending} onSend={() => void send()} />
      <ForwardPreview body={body} />
      <View style={[styles.searchRow, { borderBottomColor: colors.separator }]}>
        <AppHost style={styles.searchField}>
          <TextInput
            placeholder={t('inbox.newChatSearchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onChangeText={setSearch}
          />
        </AppHost>
      </View>
      <OfflineStatusBanner />
      {canUseNetworkSession && friendsQuery.isLoading && friends.length === 0 ? (
        <ActivityIndicator color={colors.label} style={styles.loading} accessibilityLabel={t('common.loading')} />
      ) : friendsQuery.isError && friends.length === 0 ? (
        <Text style={[styles.stateText, { color: colors.secondaryLabel }]}>{t('inbox.newChatLoadError')}</Text>
      ) : (
        <View style={styles.listWrap}>
          <FlashList
            data={visibleFriends}
            extraData={{ avatarUrls, selected }}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FriendRow
                item={item}
                avatarUrl={item.avatar_storage_path ? avatarUrls[item.avatar_storage_path] ?? null : null}
                selected={selected.has(item.id)}
                onToggle={toggle}
              />
            )}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingBottom: Math.max(bottomContentInset, 12) }}
            ListEmptyComponent={emptyState}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    alignSelf: 'stretch',
  },
  preview: {
    marginHorizontal: ROW_HORIZONTAL_PADDING,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  previewText: {
    ...typography.callout,
  },
  searchRow: {
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: ROW_HORIZONTAL_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  searchField: {
    height: 44,
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: ROW_HORIZONTAL_PADDING,
    gap: AVATAR_GAP,
  },
  rowText: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingRight: ROW_HORIZONTAL_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabels: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.body,
    fontWeight: '500',
  },
  username: {
    ...typography.footnote,
  },
  loading: {
    marginTop: 20,
  },
  listWrap: {
    flex: 1,
    width: '100%',
  },
  stateText: {
    ...typography.callout,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
  },
});
