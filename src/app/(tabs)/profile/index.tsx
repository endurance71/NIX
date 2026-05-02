import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../hooks/useAuth';
import { StatusBar } from 'expo-status-bar';
import {
  acceptFriendRequest,
  findProfileByUsername,
  listAcceptedFriends,
  listIncomingFriendRequests,
  rejectFriendRequest,
  sendFriendRequest,
} from '../../../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls, uploadProfileAvatarFromUri } from '../../../services/avatarService';
import { getCurrentUserProfile } from '../../../services/profileService';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useProfileQrPayload } from '../../../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../../../components/friend/my-profile-qr-card';
import { typography } from '../../../theme/typography';
import { Host, List, Section, Text, TextField, Button, RNHostView } from '@expo/ui/swift-ui';
import {
  foregroundStyle,
  font,
  textFieldStyle,
  textInputAutocapitalization,
  autocorrectionDisabled,
  padding,
  listStyle,
  listRowSeparator,
  refreshable,
} from '@expo/ui/swift-ui/modifiers';
import { toDomainError } from '../../../services/errors';
import { avatarSignedUrlsQueryKey, queryKeys } from '../../../lib/queryKeys';

type NativeCropResult = { path: string };
type NativeCropPickerModule = {
  openPicker: (options: {
    mediaType: 'photo';
    cropping: true;
    cropperCircleOverlay: true;
    width: number;
    height: number;
    compressImageQuality: number;
    cropperChooseText?: string;
    cropperCancelText?: string;
  }) => Promise<NativeCropResult>;
};

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();
  const { user, signOut } = useAuth();
  const qrPayload = useProfileQrPayload();
  const [searchUsername, setSearchUsername] = useState('');
  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile,
    queryFn: getCurrentUserProfile,
    staleTime: 1000 * 60 * 5,
  });
  const { data: requests = [] } = useQuery({
    queryKey: queryKeys.incomingFriendRequests,
    queryFn: listIncomingFriendRequests,
    staleTime: 1000 * 60,
  });
  const { data: friends = [] } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: listAcceptedFriends,
    staleTime: 1000 * 60 * 2,
  });
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const profileUsername = profileRow?.username ?? null;
  const avatarPaths = useMemo(
    () => (profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : []),
    [profileRow?.avatar_storage_path]
  );
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarSignedUrl = profileRow?.avatar_storage_path ? avatarUrls[profileRow.avatar_storage_path] ?? null : null;

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const invalidateSocialQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile }),
    ]);
  }, [queryClient]);

  const handleListRefresh = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.acceptedFriends, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.currentUserProfile, type: 'active' }),
      ]);
    } catch (err) {
      console.error('Nie udało się odświeżyć danych społecznościowych profilu', err);
      setFeedback('Odświeżenie nie powiodło się. Spróbuj ponownie.');
    }
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({
        type: 'active',
        predicate: (query) => {
          const key = query.queryKey[0];
          if (
            key !== queryKeys.currentUserProfile[0] &&
            key !== queryKeys.incomingFriendRequests[0] &&
            key !== queryKeys.acceptedFriends[0]
          ) {
            return false;
          }
          return query.isStale();
        },
      });
    }, [queryClient])
  );

  const handlePickAvatarPhoto = async () => {
    setFeedback(null);
    setAvatarBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFeedback('Brak dostępu do zdjęć. Zezwól w ustawieniach systemowych.');
        return;
      }
      let pickedUri: string | null = null;
      try {
        const nativeCropPickerModule = await import('react-native-image-crop-picker');
        const nativeCropPicker = nativeCropPickerModule.default as NativeCropPickerModule;
        const result = await nativeCropPicker.openPicker({
          mediaType: 'photo',
          cropping: true,
          cropperCircleOverlay: true,
          width: 512,
          height: 512,
          compressImageQuality: 0.85,
          cropperChooseText: 'Wybierz',
          cropperCancelText: 'Anuluj',
        });
        pickedUri = result.path.startsWith('file://') ? result.path : `file://${result.path}`;
      } catch (nativeErr: unknown) {
        const code = (nativeErr as { code?: string })?.code;
        const message = String((nativeErr as { message?: string })?.message ?? '');
        if (code === 'E_PICKER_CANCELLED') return;
        const nativeModuleUnavailable =
          message.includes('RNCImageCropPicker') ||
          message.includes('could not be found') ||
          message.includes('Cannot find module');

        if (!nativeModuleUnavailable) throw nativeErr;

        const fallbackResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });
        if (fallbackResult.canceled || !fallbackResult.assets[0]?.uri) return;
        pickedUri = fallbackResult.assets[0].uri;
      }

      if (!pickedUri) return;
      await uploadProfileAvatarFromUri(pickedUri);
      await invalidateSocialQueries();
      setFeedback('Awatar zapisany.');
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'E_PICKER_CANCELLED') {
        return;
      }
      setFeedback(toDomainError(err, 'Nie udało się zapisać zdjęcia.').message);
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSendInvite = async () => {
    setFeedback(null);
    const normalized = searchUsername.trim();
    if (!normalized) {
      setFeedback('Podaj nazwę użytkownika, np. @nix_friend.');
      return;
    }

    setActionLoadingId('invite');
    try {
      const profile = await findProfileByUsername(normalized);
      if (!profile) {
        setFeedback('Nie znaleziono użytkownika o takiej nazwie.');
        return;
      }

      const result = await sendFriendRequest(profile.id);
      if (result === 'request_sent') {
        setFeedback(`Zaproszenie do @${profile.username} zostało wysłane.`);
      } else if (result === 'already_requested') {
        setFeedback('To zaproszenie jest już wysłane i oczekuje na akceptację.');
      } else if (result === 'already_friends') {
        setFeedback(`Jesteście już znajomymi z @${profile.username}.`);
      } else if (result === 'accepted_reverse_request') {
        setFeedback(`Zaakceptowano zaproszenie od @${profile.username}.`);
      }

      setSearchUsername('');
      await invalidateSocialQueries();
    } catch (err: any) {
      setFeedback(err?.message ?? 'Nie udało się wysłać zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAccept = async (requestId: string) => {
    setActionLoadingId(requestId);
    setFeedback(null);
    try {
      await acceptFriendRequest(requestId);
      await invalidateSocialQueries();
      setFeedback('Zaproszenie zaakceptowane.');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Nie udało się zaakceptować zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoadingId(requestId);
    setFeedback(null);
    try {
      await rejectFriendRequest(requestId);
      await invalidateSocialQueries();
      setFeedback('Zaproszenie usunięte.');
    } catch (err: any) {
      setFeedback(err?.message ?? 'Nie udało się odrzucić zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const hasAvatar = Boolean(profileRow?.avatar_storage_path || profileRow?.avatar_emoji);
  const initialLetter = (profileUsername ?? user?.email ?? '?').replace(/^@/, '').charAt(0).toUpperCase();

  if (profilePending) {
    return (
      <Host style={[styles.container, styles.centered]}>
        <StatusBar style={statusBarStyle} />
        <ActivityIndicator color={colors.label} />
      </Host>
    );
  }

  return (
    <>
      <Host style={styles.container} useViewportSizeMeasurement colorScheme={statusBarStyle === 'light' ? 'dark' : 'light'}>
        <List
          modifiers={[
            listStyle('insetGrouped'),
            padding({ top: 0 }),
            refreshable(handleListRefresh),
          ]}>
          <Section>
            <Text modifiers={[font({ size: 22, weight: 'bold', design: 'rounded' })]}>
              @{profileUsername ?? 'brak_nazwy_uzytkownika'}
            </Text>
            <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 14, design: 'rounded' })]}>
              {user?.email ?? '—'} ({user?.id?.slice(0, 8)}...)
            </Text>
          </Section>
          <Section title="Mój kod QR">
            <RNHostView matchContents>
              <MyProfileQrCard
                payload={qrPayload}
                colors={colors}
                centerOverlayRatio={0.3}
                avatarUrl={avatarSignedUrl}
                avatarStoragePath={profileRow?.avatar_storage_path ?? null}
                avatarEmoji={profileRow?.avatar_emoji}
                fallbackInitial={initialLetter}
              />
            </RNHostView>
            <RNHostView matchContents>
              <View style={styles.avatarActions}>
                <Pressable
                  onPress={handlePickAvatarPhoto}
                  disabled={avatarBusy}
                  style={({ pressed }) => [styles.avatarLink, pressed && styles.avatarLinkPressed]}>
                  <RNText style={[styles.avatarLinkText, { color: colors.accent }]}>
                    {avatarBusy ? 'Przetwarzanie…' : 'Zdjęcie z biblioteki'}
                  </RNText>
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/profile/remove-avatar',
                      params: {
                        avatarUrl: avatarSignedUrl ?? undefined,
                        avatarStoragePath: profileRow?.avatar_storage_path ?? undefined,
                        avatarEmoji: profileRow?.avatar_emoji ?? undefined,
                        fallbackInitial: initialLetter,
                      },
                    })
                  }
                  disabled={avatarBusy || !hasAvatar}
                  style={({ pressed }) => [styles.avatarLink, pressed && styles.avatarLinkPressed]}>
                  <RNText style={[styles.avatarLinkText, { color: hasAvatar ? colors.destructive : colors.tertiaryLabel }]}>
                    Usuń awatar
                  </RNText>
                </Pressable>
              </View>
            </RNHostView>
          </Section>
          <Section title="Dodaj znajomego">
            <Button label="Skanuj QR" onPress={() => router.push('/friend-scan-qr')} />
            <TextField
              placeholder="@nazwa_uzytkownika"
              defaultValue={searchUsername}
              onValueChange={setSearchUsername}
              modifiers={[
                textFieldStyle('roundedBorder'),
                textInputAutocapitalization('never'),
                autocorrectionDisabled(true),
              ]}
            />
            <Button
              label={actionLoadingId === 'invite' ? 'Wysyłanie...' : 'Wyślij zaproszenie'}
              onPress={handleSendInvite}
            />
          </Section>
          {requests.length > 0 ? (
            <Section title={`Zaproszenia (${requests.length})`}>
              {requests.map((request) => (
                <RNHostView matchContents key={request.id}>
                  <View style={styles.socialRow}>
                    <RNText numberOfLines={1} style={[styles.socialTitle, { color: colors.label }]}>
                      @{request.requester.username}
                    </RNText>
                    <View style={styles.socialActions}>
                      <Button label="Przyjmij" onPress={() => handleAccept(request.id)} />
                      <Button label="Usuń" onPress={() => handleReject(request.id)} role="destructive" />
                    </View>
                  </View>
                </RNHostView>
              ))}
            </Section>
          ) : null}
          <Section title={`Znajomi (${friends.length})`}>
            {friends.length === 0 ? (
              <Text
                modifiers={[
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  listRowSeparator('hidden'),
                ]}>
                Nie masz jeszcze znajomych.
              </Text>
            ) : (
              friends.map((friend) => (
                <RNHostView matchContents key={friend.id}>
                  <View style={styles.socialRow}>
                    <RNText numberOfLines={1} style={[styles.socialTitle, { color: colors.label }]}>
                      @{friend.username}
                    </RNText>
                    <Button
                      label={actionLoadingId === `friend-${friend.id}` ? 'Usuwanie...' : 'Usuń znajomego'}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/profile/remove-friend',
                          params: {
                            friendId: friend.id,
                            username: friend.username,
                            avatarStoragePath: friend.avatar_storage_path ?? undefined,
                            avatarEmoji: friend.avatar_emoji ?? undefined,
                            fallbackInitial: friend.username.replace(/^@/, '').charAt(0).toUpperCase(),
                          },
                        })
                      }
                      role="destructive"
                    />
                  </View>
                </RNHostView>
              ))
            )}
          </Section>
          {feedback ? (
            <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), font({ size: 13, design: 'rounded' })]}>
              {feedback}
            </Text>
          ) : null}
          <Section title="Konto">
            <Button label="Wyloguj" onPress={handleSignOut} />
          </Section>
        </List>
        <Stack.Screen.Title large>Profil</Stack.Screen.Title>
      </Host>
    </>
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
  avatarActions: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  avatarLink: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  avatarLinkPressed: {
    opacity: 0.6,
  },
  avatarLinkText: {
    ...typography.headline,
    fontWeight: '500',
  },
  socialRow: {
    gap: 8,
    paddingVertical: 6,
  },
  socialTitle: {
    ...typography.headline,
  },
  socialActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
