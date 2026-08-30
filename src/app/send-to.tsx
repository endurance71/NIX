import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAcceptedFriends, type FriendProfile } from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { toDomainError } from '../services/errors';
import { useVideoDraft } from '../context/videoDraft';
import { usePhotoDraft } from '../context/photoDraft';
import { useUploadQueue } from '../context/uploadQueue';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { AppIcon } from '../components/ui/app-icon';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { normalizeNixViewDurationSec } from '../lib/nixViewDuration';
import { applySuggestedRecipientOnce } from '../lib/suggestedRecipient';
import { toggleSetValue } from '../lib/selection';
import { useScreenInsets } from '../hooks/useScreenInsets';
import { notifyError, notifySuccess } from '../lib/appNotify';
import { selection, tap } from '../lib/haptics';
import { usePushNotifications } from '../context/pushNotifications';
import { APP_ICON_SIZE } from '../theme/app-icons';
import { runWithFinally } from '../lib/runWithFinally';
import { useTranslation } from 'react-i18next';
import { bakeMediaOverlays } from '../lib/bakeMediaTextOverlay';
import { normalizeMediaTextOverlay } from '../types/mediaTextOverlay';
import { normalizeMediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { useAuth } from '../hooks/useAuth';
import { OfflineStatusBanner } from '../components/auth/OfflineStatusBanner';
import { mediaEditingViewport } from '../lib/mediaPresentation';

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

function throwRejectedResult(result: PromiseRejectedResult | undefined) {
  if (result) throw result.reason;
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
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={t(selected ? 'sendTo.deselectA11y' : 'sendTo.selectA11y', {
        username: item.username,
      })}
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
        {item.display_name ? item.display_name : item.username ? `@${item.username}` : t('common.unknown')}
      </Text>
      {selected ? <AppIcon name="checkCircle" size={APP_ICON_SIZE.xxl} color={tintColor} /> : null}
    </Pressable>
  );
}

export default function SendToSheet() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const { colors } = useAppTheme();
  const stylesForTheme = createStyles(colors, topContentInset, bottomContentInset);
  const rawParams = useLocalSearchParams<{ uri?: string; viewDurationSec?: string; mode?: string; recipientId?: string }>();
  const { draft: draftPhoto, clearDraft: clearPhotoDraft } = usePhotoDraft();
  const photoUri = draftPhoto?.uri ?? decodeParamUri(paramFirst(rawParams.uri));
  const mode = paramFirst(rawParams.mode);
  const viewDurationSec = normalizeNixViewDurationSec(paramFirst(rawParams.viewDurationSec));
  const isVideo = mode === 'video';
  const {
    segments,
    clearSegments,
    textOverlay: videoTextOverlay,
    drawingOverlay: videoDrawingOverlay,
  } = useVideoDraft();
  const { enqueueMediaBatch, cancelUpload } = useUploadQueue();
  const { user, isOfflineAuthenticated, canUseNetworkSession } = useAuth();
  const { offerAfterSuccessfulSend } = usePushNotifications();
  const {
    data: profilesData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 50 }),
    enabled: Boolean(user) && canUseNetworkSession,
    staleTime: 1000 * 60 * 2,
  });

  const profiles = profilesData ?? [];
  const isOfflineRecipientSnapshotMissing = isOfflineAuthenticated
    && profilesData === undefined;

  // Only refetch when stale — formSheet can re-fire focus during presentation;
  // invalidateQueries would cancel in-flight fetches and leave isPending spinning.
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSending, setIsSending] = useState(false);
  const sendLockRef = useRef(false);
  const didPreselectRecipientRef = useRef(false);
  const suggestedRecipientId = paramFirst(rawParams.recipientId);

  useEffect(() => {
    if (profilesData === undefined) return;
    const { applied, selectedId } = applySuggestedRecipientOnce({
      alreadyApplied: didPreselectRecipientRef.current,
      recipientId: suggestedRecipientId,
      acceptedFriendIds: profilesData.map((profile) => profile.id),
    });
    didPreselectRecipientRef.current = applied;
    if (selectedId) {
      setSelectedIds(new Set([selectedId]));
    }
  }, [profilesData, suggestedRecipientId]);

  const selectedCount = selectedIds.size;
  const selectedIdList = Array.from(selectedIds);

  const paths = profiles.flatMap((p) => (p.avatar_storage_path ? [p.avatar_storage_path] : []));
  const sortedFriendAvatarPaths = Array.from(new Set(paths)).sort();

  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(sortedFriendAvatarPaths),
    queryFn: () => createSignedAvatarUrls(sortedFriendAvatarPaths),
    enabled: canUseNetworkSession && sortedFriendAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  const handleSend = async () => {
    if (selectedCount === 0 || isSending || sendLockRef.current) return;
    if (!isVideo && !photoUri) return;
    if (isVideo && (!segments?.length || segments.length === 0)) return;

    tap('medium');
    sendLockRef.current = true;
    setIsSending(true);

    const recipients = selectedIdList.map((receiverId) => ({
      receiverId,
      viewDurationSec,
      sequenceIndex: 0,
    }));
    const enqueuedJobIds: string[] = [];
    await runWithFinally(async () => {
      try {
        const textOverlay = isVideo
          ? normalizeMediaTextOverlay(videoTextOverlay)
          : normalizeMediaTextOverlay(draftPhoto?.textOverlay);
        const drawingOverlay = isVideo
          ? normalizeMediaDrawingOverlay(videoDrawingOverlay)
          : normalizeMediaDrawingOverlay(draftPhoto?.drawingOverlay);

        if (isVideo) {
          const bakedSegments = await Promise.all(
            segments!.map(async (segment) => {
              const mediaViewport = mediaEditingViewport({
                media: segment,
                viewportWidth,
                viewportHeight,
                captureOrientation: segment.captureOrientation,
              });
              const baked = await bakeMediaOverlays({
                uri: segment.uri,
                mediaType: 'video',
                textOverlay,
                drawingOverlay,
                viewportWidth: mediaViewport.width,
                viewportHeight: mediaViewport.height,
              });
              return { ...segment, uri: baked.uri };
            })
          );
          const segmentInputs = bakedSegments.map((segment, sequenceIndex) => ({
            fileUri: segment.uri,
            mediaType: 'video' as const,
            recipients: recipients.map((recipient) => ({ ...recipient, sequenceIndex })),
            playbackDurationMs: segment.durationMs,
          }));
          const results = await Promise.allSettled(
            segmentInputs.map((input) => enqueueMediaBatch(input))
          );
          for (const result of results) {
            if (result.status === 'fulfilled') enqueuedJobIds.push(result.value.jobId);
          }
          const failedResult = results.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected'
          );
          throwRejectedResult(failedResult);
        } else {
          const mediaViewport = mediaEditingViewport({
            media: draftPhoto ?? {},
            viewportWidth,
            viewportHeight,
            captureOrientation: draftPhoto?.captureOrientation,
          });
          const baked = await bakeMediaOverlays({
            uri: photoUri!,
            mediaType: 'image',
            textOverlay,
            drawingOverlay,
            viewportWidth: mediaViewport.width,
            viewportHeight: mediaViewport.height,
          });
          const result = await enqueueMediaBatch({
            fileUri: baked.uri,
            mediaType: 'image',
            recipients,
            // After bake dimensions may change slightly; omit to force safe re-encode path when baked.
            sourceWidth: baked.didBake ? undefined : draftPhoto?.width,
            sourceHeight: baked.didBake ? undefined : draftPhoto?.height,
          });
          enqueuedJobIds.push(result.jobId);
        }

        if (isVideo) clearSegments();
        else clearPhotoDraft();
        notifySuccess(t('inbox.sent'));
        router.dismissAll();
        router.replace('/(tabs)/inbox');
        setTimeout(() => void offerAfterSuccessfulSend(), 400);
      } catch (err) {
        await Promise.all(enqueuedJobIds.map((jobId) => cancelUpload(jobId).catch(() => undefined)));
        notifyError(t('sendTo.enqueueFailureTitle'), {
          message: toDomainError(err, t('sendTo.enqueueFailureBody')).message,
        });
      }
    }, () => {
      setIsSending(false);
      sendLockRef.current = false;
    });
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
      <Text style={stylesForTheme.title}>{t('sendTo.title')}</Text>
      <Text style={stylesForTheme.subtitle}>{t('sendTo.subtitle')}</Text>
      <OfflineStatusBanner />

      {showInitialLoader ? (
        <ActivityIndicator color={colors.label} style={styles.loading} />
      ) : canUseNetworkSession && isError ? (
        <View style={stylesForTheme.emptyState}>
          <Text style={stylesForTheme.emptyStateText}>{t('sendTo.loadFailure')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            onPress={() => void refetch()}
            style={styles.retryButton}
            disabled={isFetching}>
            {isFetching ? (
              <ActivityIndicator color={colors.label} />
            ) : (
              <Text style={[styles.retryButtonText, { color: colors.systemBlue }]}>{t('common.retry')}</Text>
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
                <Text style={stylesForTheme.emptyStateText}>
                  {t(isOfflineRecipientSnapshotMissing ? 'sendTo.offlineCacheMissing' : 'sendTo.empty')}
                </Text>
              </View>
            }
          />
        </View>
      )}

      <View style={stylesForTheme.footer}>
        <Text style={stylesForTheme.selectionCount}>{t('sendTo.selectedCount', { count: selectedCount })}</Text>
        <Pressable
          accessibilityLabel={t('sendTo.sendA11y')}
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
            <View style={styles.sendingContent}>
              <ActivityIndicator color={colors.buttonPrimaryText} />
              <Text style={stylesForTheme.sendButtonText}>{t('sendTo.securing')}</Text>
            </View>
          ) : (
            <Text style={stylesForTheme.sendButtonText}>
              {selectedCount > 1
                ? t('sendTo.sendMany', { count: selectedCount })
                : t('sendTo.sendOne')}
            </Text>
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
  sendingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
