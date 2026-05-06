import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { toDomainError } from '../services/errors';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { useVideoDraft } from '../context/VideoDraftContext';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { SFSymbol } from '../components/ui/sf-symbol';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { normalizeSnapViewDurationSec } from '../lib/snapViewDuration';
import { toggleSetValue } from '../lib/selection';
import { SHEET_CONTENT_PADDING_TOP } from '../theme/sheetLayout';
import { notifyError, notifySuccess } from '../lib/appNotify';

const SEND_CONCURRENCY = 2;

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type FriendRecipientRowProps = {
  avatarUrl: string | null;
  item: FriendProfile;
  onToggle: (id: string) => void;
  selected: boolean;
  tintColor: string;
};

const FriendRecipientRow = memo(function FriendRecipientRow({
  avatarUrl,
  item,
  onToggle,
  selected,
  tintColor,
}: FriendRecipientRowProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={`${selected ? 'Odznacz' : 'Zaznacz'} @${item.username}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.profileRow,
        { borderBottomColor: colors.separator },
        selected && { backgroundColor: colors.systemFill },
        pressed && styles.profileRowPressed,
      ]}
      onPress={() => onToggle(item.id)}
    >
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
        {item.username ?? 'Nieznany'}
      </Text>
      {selected ? <SFSymbol name="checkmark.circle.fill" size={24} tintColor={tintColor} /> : null}
    </Pressable>
  );
});

export default function SendToSheet() {
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const stylesForTheme = useMemo(() => createStyles(colors), [colors]);
  const rawParams = useLocalSearchParams<{ uri?: string; viewDurationSec?: string; mode?: string }>();
  const uri = paramFirst(rawParams.uri);
  const mode = paramFirst(rawParams.mode);
  const viewDurationSec = useMemo(
    () => normalizeSnapViewDurationSec(paramFirst(rawParams.viewDurationSec)),
    [rawParams.viewDurationSec]
  );
  const isVideo = mode === 'video' && !uri;
  const { segments, clearSegments } = useVideoDraft();
  const { uploadSnap, uploadVideoSegments } = useMediaUpload();
  const { data: profiles = [], isPending: loading } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 50 }),
    staleTime: 1000 * 60 * 2,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSending, setIsSending] = useState(false);
  const sendLockRef = useRef(false);

  const selectedCount = selectedIds.size;
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const sortedFriendAvatarPaths = useMemo(() => {
    const paths = profiles.map((p) => p.avatar_storage_path).filter((path): path is string => Boolean(path));
    return Array.from(new Set(paths)).sort();
  }, [profiles]);

  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(sortedFriendAvatarPaths),
    queryFn: () => createSignedAvatarUrls(sortedFriendAvatarPaths),
    enabled: sortedFriendAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  const handleSend = async () => {
    if (selectedCount === 0 || isSending || sendLockRef.current) return;
    if (!isVideo && !uri) return;
    if (isVideo && (!segments?.length || segments.length === 0)) return;

    sendLockRef.current = true;
    setIsSending(true);

    let successCount = 0;
    let failureCount = 0;
    for (let index = 0; index < selectedIdList.length; index += SEND_CONCURRENCY) {
      const batch = selectedIdList.slice(index, index + SEND_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (receiverId) => {
          try {
            if (isVideo) {
              return await uploadVideoSegments(segments!, receiverId, viewDurationSec, {
                awaitCompletion: true,
              });
            } else {
              return await uploadSnap(uri!, receiverId, viewDurationSec, {
                awaitCompletion: true,
              });
            }
          } catch (err) {
            const message = toDomainError(err, 'Spróbuj ponownie za chwilę.').message;
            return { success: false as const, error: message };
          }
        })
      );

      results.forEach((result) => {
        if (result.success) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      });
    }

    if (isVideo) clearSegments();
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle });

    if (successCount > 0) {
      notifySuccess(
        'Wysyłka zakończona',
        failureCount > 0 ? { message: `Błędy: ${failureCount}/${selectedCount}.` } : undefined
      );
    }
    if (failureCount > 0) {
      notifyError('Część wiadomości nie została wysłana', {
        message: `Niepowodzenia: ${failureCount}/${selectedCount}.`,
      });
    }

    setIsSending(false);
    sendLockRef.current = false;
    router.dismissAll();
  };

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => toggleSetValue(prev, id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FriendProfile }) => (
      <FriendRecipientRow
        item={item}
        selected={selectedIds.has(item.id)}
        onToggle={toggleSelection}
        tintColor={colors.systemBlue}
        avatarUrl={item.avatar_storage_path ? avatarUrls[item.avatar_storage_path] ?? null : null}
      />
    ),
    [avatarUrls, colors.systemBlue, selectedIds, toggleSelection]
  );

  return (
    <View style={stylesForTheme.container}>
      <Text style={stylesForTheme.title}>Wyślij do</Text>
      <Text style={stylesForTheme.subtitle}>Wybierz jednego lub wielu znajomych</Text>

      {loading ? (
        <ActivityIndicator color={colors.label} style={styles.loading} />
      ) : (
        <View style={stylesForTheme.listWrap}>
          <FlashList
            data={profiles}
            extraData={{ avatarUrls, selectedIds }}
            getItemType={() => 'friend-recipient'}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={stylesForTheme.emptyState}>
                <Text style={stylesForTheme.emptyStateText}>Nie masz jeszcze zaakceptowanych znajomych.</Text>
              </View>
            }
          />
        </View>
      )}

      <View style={stylesForTheme.footer}>
        <Text style={stylesForTheme.selectionCount}>Zaznaczeni: {selectedCount}</Text>
        <Pressable
          accessibilityLabel="Wyślij wiadomość"
          accessibilityRole="button"
          accessibilityState={{ disabled: selectedCount === 0 || isSending }}
          style={[
            stylesForTheme.sendButton,
            (selectedCount === 0 || isSending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={selectedCount === 0 || isSending}
        >
          {isSending ? (
            <ActivityIndicator color={colors.buttonPrimaryText} />
          ) : (
            <>
              <Text style={stylesForTheme.sendButtonText}>
                {selectedCount > 1 ? `Wyślij do ${selectedCount} znajomych` : 'Wyślij wiadomość'}
              </Text>
              <SFSymbol name="paperplane.fill" size={20} tintColor={colors.buttonPrimaryText} />
            </>
          )}
        </Pressable>
      </View>
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
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingTop: SHEET_CONTENT_PADDING_TOP,
    },
    title: {
      ...typography.title2,
      color: colors.label,
      textAlign: 'center',
    },
    subtitle: {
      ...typography.footnote,
      marginTop: 6,
      marginBottom: 12,
      textAlign: 'center',
      color: colors.tertiaryLabel,
    },
    listWrap: {
      flex: 1,
      width: '100%',
      marginTop: 10,
    },
    footer: {
      padding: 24,
      paddingBottom: 28,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      backgroundColor: 'transparent',
    },
    selectionCount: {
      ...typography.footnote,
      color: colors.tertiaryLabel,
      marginBottom: 10,
      fontVariant: ['tabular-nums'],
    },
    sendButton: {
      minHeight: 56,
      flexDirection: 'row',
      backgroundColor: colors.buttonPrimaryBg,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    sendButtonText: {
      ...typography.headline,
      color: colors.buttonPrimaryText,
    },
    emptyState: {
      paddingHorizontal: 24,
      paddingTop: SHEET_CONTENT_PADDING_TOP,
    },
    emptyStateText: {
      ...typography.callout,
      color: colors.tertiaryLabel,
    },
  });
