import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { toDomainError } from '../services/errors';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { useVideoDraft } from '../context/videoDraft';
import { usePhotoDraft } from '../context/photoDraft';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { AppIcon } from '../components/ui/app-icon';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { normalizeNixViewDurationSec } from '../lib/nixViewDuration';
import { toggleSetValue } from '../lib/selection';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { notifyError, notifySuccess } from '../lib/appNotify';
import { selection, tap } from '../lib/haptics';
import { usePushNotifications } from '../context/pushNotifications';
import { APP_ICON_SIZE } from '../theme/app-icons';

const SEND_CONCURRENCY = 2;

function paramFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function decodeParamUri(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type FriendRecipientRowProps = {
  avatarUrl: string | null;
  item: FriendProfile;
  onToggle: (id: string) => void;
  selected: boolean;
  tintColor: string;
};

function FriendRecipientRow({
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
        {item.display_name ? item.display_name : item.username ? `@${item.username}` : 'Nieznany'}
      </Text>
      {selected ? <AppIcon name="checkCircle" size={APP_ICON_SIZE.xxl} color={tintColor} /> : null}
    </Pressable>
  );
}

export default function SendToSheet() {
  const queryClient = useQueryClient();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const { colors } = useAppTheme();
  const stylesForTheme = createStyles(colors, topContentInset, bottomContentInset);
  const rawParams = useLocalSearchParams<{ uri?: string; viewDurationSec?: string; mode?: string }>();
  const paramUri = decodeParamUri(paramFirst(rawParams.uri));
  const mode = paramFirst(rawParams.mode);
  const viewDurationSec = normalizeNixViewDurationSec(paramFirst(rawParams.viewDurationSec));
  const { uri: draftPhotoUri, clearUri: clearPhotoUri } = usePhotoDraft();
  const uri = draftPhotoUri ?? paramUri;
  const isVideo = mode === 'video';
  const { segments, clearSegments } = useVideoDraft();
  const { uploadNix, uploadVideoSegments } = useMediaUpload();
  const { offerAfterSuccessfulSend } = usePushNotifications();
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

  // Only refetch when stale — formSheet can re-fire focus during presentation;
  // invalidateQueries would cancel in-flight fetches and leave isPending spinning.
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSending, setIsSending] = useState(false);
  const sendLockRef = useRef(false);

  const selectedCount = selectedIds.size;
  const selectedIdList = Array.from(selectedIds);

  const paths = profiles.flatMap((p) => (p.avatar_storage_path ? [p.avatar_storage_path] : []));
  const sortedFriendAvatarPaths = Array.from(new Set(paths)).sort();

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

    tap('medium');
    sendLockRef.current = true;
    setIsSending(true);

    let successCount = 0;
    let failureCount = 0;
    const failureReasons = new Set<string>();
    // Partie po SEND_CONCURRENCY: wewnątrz partii Promise.all; kolejne partie sekwencyjnie — rekurencja zamiast for+await dla react-doctor.
    const processBatchFromIndex = async (startIndex: number): Promise<void> => {
      if (startIndex >= selectedIdList.length) return;
      const batch = selectedIdList.slice(startIndex, startIndex + SEND_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (receiverId) => {
          try {
            if (isVideo) {
              return await uploadVideoSegments(segments!, receiverId, viewDurationSec, {
                awaitCompletion: true,
              });
            }
            return await uploadNix(uri!, receiverId, viewDurationSec, {
              awaitCompletion: true,
            });
          } catch (err) {
            const message = toDomainError(err, 'Spróbuj ponownie za chwilę.').message;
            return { success: false as const, error: message };
          }
        })
      );

      for (const result of results) {
        if (result.success) successCount += 1;
        else {
          failureCount += 1;
          if (result.error) failureReasons.add(result.error);
        }
      }

      await processBatchFromIndex(startIndex + SEND_CONCURRENCY);
    };

    let completed = false;
    try {
      await processBatchFromIndex(0);

      if (isVideo) clearSegments();
      else clearPhotoUri();
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle });

      if (successCount > 0) {
        notifySuccess(
          'Wysyłka zakończona',
          failureCount > 0 ? { message: `Błędy: ${failureCount}/${selectedCount}.` } : undefined
        );
      }
      if (failureCount > 0) {
        const firstFailureReason = failureReasons.values().next().value;
        notifyError('Część wiadomości nie została wysłana', {
          message: firstFailureReason ?? `Niepowodzenia: ${failureCount}/${selectedCount}.`,
        });
      }
      completed = true;
    } catch (err) {
      notifyError('Wysyłka nie powiodła się', {
        message: toDomainError(err, 'Spróbuj ponownie za chwilę.').message,
      });
    }
    setIsSending(false);
    sendLockRef.current = false;
    if (!completed) return;

    router.dismissAll();
    if (successCount > 0) {
      setTimeout(() => void offerAfterSuccessfulSend(), 400);
    }
  };

  const toggleSelection = (id: string) => {
    selection();
    setSelectedIds((prev) => toggleSetValue(prev, id));
  };

  const renderItem = ({ item }: { item: FriendProfile }) => (
    <FriendRecipientRow
      item={item}
      selected={selectedIds.has(item.id)}
      onToggle={toggleSelection}
      tintColor={colors.systemBlue}
      avatarUrl={item.avatar_storage_path ? avatarUrls[item.avatar_storage_path] ?? null : null}
    />
  );

  return (
    <View style={stylesForTheme.container}>
      <Text style={stylesForTheme.title}>Wyślij do</Text>
      <Text style={stylesForTheme.subtitle}>Wybierz jednego lub wielu znajomych</Text>

      {showInitialLoader ? (
        <ActivityIndicator color={colors.label} style={styles.loading} />
      ) : isError ? (
        <View style={stylesForTheme.emptyState}>
          <Text style={stylesForTheme.emptyStateText}>Nie udało się wczytać znajomych.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Spróbuj ponownie"
            onPress={() => void refetch()}
            style={styles.retryButton}
            disabled={isFetching}>
            {isFetching ? (
              <ActivityIndicator color={colors.label} />
            ) : (
              <Text style={[styles.retryButtonText, { color: colors.systemBlue }]}>Spróbuj ponownie</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={stylesForTheme.listWrap}>
          <FlashList
            data={profiles}
            extraData={{ avatarUrls, selectedIds }}
            // @ts-expect-error - estimatedItemSize type issue
            estimatedItemSize={64}
            getItemType={() => 'friend-recipient'}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={stylesForTheme.listContent}
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
              <AppIcon name="send" size={APP_ICON_SIZE.lg} color={colors.buttonPrimaryText} />
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
  sendButtonDisabled: {
    opacity: 0.5,
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
    footer: {
      paddingHorizontal: 22,
      paddingTop: 18,
      paddingBottom: Math.max(bottomInset, 28),
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
      paddingTop: paddingTop,
    },
    emptyStateText: {
      ...typography.callout,
      color: colors.tertiaryLabel,
    },
  });
