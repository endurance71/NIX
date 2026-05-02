import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMediaUpload } from '../hooks/useMediaUpload';
import { listAcceptedFriends } from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls } from '../services/avatarService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThemeColors } from '../theme/colors';
import { APP_FONT_FAMILY } from '../theme/typography';
import { SFSymbol } from '../components/ui/sf-symbol';
import { AvatarCircle } from '../components/ui/avatar-circle';
import { normalizeSnapViewDurationSec } from '../lib/snapViewDuration';

export default function SendToSheet() {
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { uri, viewDurationSec: viewDurationParam } = useLocalSearchParams<{
    uri: string;
    viewDurationSec?: string;
  }>();
  const viewDurationSec = useMemo(() => normalizeSnapViewDurationSec(viewDurationParam), [viewDurationParam]);
  const { data: profiles = [], isPending: loading } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: listAcceptedFriends,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { uploadSnap, isUploading } = useMediaUpload();

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
    if (!uri || selectedIds.length === 0) return;

    const failures: string[] = [];

    for (const receiverId of selectedIds) {
      const { success, error } = await uploadSnap(uri, receiverId, viewDurationSec);
      if (!success) failures.push(error ?? 'Spróbuj ponownie za chwilę.');
    }

    if (failures.length === 0) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle });
      router.dismissAll(); // Zamknij sheet i podgląd.
      return;
    }

    Alert.alert(
      'Nie udało się wysłać do wszystkich',
      `${failures.length} z ${selectedIds.length} wysyłek nie powiodło się.`
    );
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wyślij do</Text>
      <Text style={styles.subtitle}>Wybierz jednego lub wielu znajomych</Text>

      {loading ? (
        <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 20 }} />
      ) : (
        <View style={{ flex: 1, width: '100%', marginTop: 10 }}>
          <FlashList
            data={profiles}
            extraData={selectedIds}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable 
                style={[
                  styles.profileRow,
                  selectedIds.includes(item.id) && styles.profileRowSelected
                ]}
                onPress={() => toggleSelection(item.id)}
              >
                <View style={{ marginRight: 16 }}>
                  <AvatarCircle
                    size={40}
                    url={item.avatar_storage_path ? avatarUrls[item.avatar_storage_path] : null}
                    storagePath={item.avatar_storage_path}
                    emoji={item.avatar_emoji}
                    fallbackInitial={item.username?.charAt(0)}
                  />
                </View>
                <Text style={styles.username}>{item.username ?? 'Nieznany'}</Text>
                {selectedIds.includes(item.id) && (
                  <SFSymbol name="checkmark.circle.fill" size={24} tintColor={colors.accent} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>Nie masz jeszcze zaakceptowanych znajomych.</Text>
              </View>
            }
          />
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.selectionCount}>
          Zaznaczeni: {selectedIds.length}
        </Text>
        <Pressable 
          style={[
            styles.sendButton,
            (selectedIds.length === 0 || isUploading) && styles.sendButtonDisabled
          ]}
          onPress={handleSend}
          disabled={selectedIds.length === 0 || isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color={colors.buttonPrimaryText} />
          ) : (
            <>
              <Text style={styles.sendButtonText}>
                {selectedIds.length > 1 ? `Wyślij do ${selectedIds.length} znajomych` : 'Wyślij wiadomość'}
              </Text>
              <SFSymbol name="paperplane.fill" size={20} tintColor={colors.buttonPrimaryText} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    paddingTop: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 12,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: APP_FONT_FAMILY,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  profileRowSelected: {
    backgroundColor: colors.surface,
  },

  username: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: APP_FONT_FAMILY,
  },
  footer: {
    padding: 24,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  selectionCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: APP_FONT_FAMILY,
    marginBottom: 10,
  },
  sendButton: {
    flexDirection: 'row',
    backgroundColor: colors.buttonPrimaryBg,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.buttonPrimaryText,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: APP_FONT_FAMILY,
  },
  emptyState: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: 15,
    fontFamily: APP_FONT_FAMILY,
  },
  });
