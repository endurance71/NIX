import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Keyboard,
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
  cancelOutgoingFriendRequest,
  findProfileByUsername,
  listAcceptedFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  removeFriend,
  rejectFriendRequest,
  sendFriendRequest,
} from '../../../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls, uploadProfileAvatarFromUri } from '../../../services/avatarService';
import { getCurrentUserProfile } from '../../../services/profileService';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { useProfileQrPayload } from '../../../hooks/useProfileQrPayload';
import { MyProfileQrCard } from '../../../components/friend/my-profile-qr-card';
import { typography } from '../../../theme/typography';
import { SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING } from '../../../theme/swiftUiEmbeddedLayout';
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
import { avatarSignedUrlsQueryKey, queryKeys } from '../../../lib/queryKeys';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess } from '../../../lib/appNotify';
import { AvatarCircle } from '../../../components/ui/avatar-circle';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors, statusBarStyle } = useAppTheme();
  const { user, signOut } = useAuth();
  const qrPayload = useProfileQrPayload();
  const [searchUsername, setSearchUsername] = useState('');
  const [inviteInputResetKey, setInviteInputResetKey] = useState(0);
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
  const { data: outgoingRequests = [] } = useQuery({
    queryKey: queryKeys.outgoingFriendRequests,
    queryFn: listOutgoingFriendRequests,
    staleTime: 1000 * 60,
  });
  const { data: friends = [] } = useQuery({
    queryKey: queryKeys.acceptedFriends,
    queryFn: () => listAcceptedFriends({ limit: 50 }),
    staleTime: 1000 * 60 * 2,
  });
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const profileUsername = profileRow?.username ?? null;
  const avatarPaths = useMemo(
    () => (profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : []),
    [profileRow?.avatar_storage_path]
  );
  const outgoingAvatarPaths = useMemo(
    () =>
      Array.from(
        new Set(
          outgoingRequests
            .map((request) => request.recipient.avatar_storage_path)
            .filter((path): path is string => Boolean(path))
        )
      ),
    [outgoingRequests]
  );
  const incomingAvatarPaths = useMemo(
    () =>
      Array.from(
        new Set(
          requests
            .map((request) => request.requester.avatar_storage_path)
            .filter((path): path is string => Boolean(path))
        )
      ),
    [requests]
  );
  const friendAvatarPaths = useMemo(
    () =>
      Array.from(
        new Set(
          friends
            .map((friend) => friend.avatar_storage_path)
            .filter((path): path is string => Boolean(path))
        )
      ),
    [friends]
  );
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarSignedUrl = profileRow?.avatar_storage_path ? avatarUrls[profileRow.avatar_storage_path] ?? null : null;
  const { data: outgoingAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(outgoingAvatarPaths),
    queryFn: () => createSignedAvatarUrls(outgoingAvatarPaths),
    enabled: outgoingAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const { data: incomingAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(incomingAvatarPaths),
    queryFn: () => createSignedAvatarUrls(incomingAvatarPaths),
    enabled: incomingAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const { data: friendAvatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(friendAvatarPaths),
    queryFn: () => createSignedAvatarUrls(friendAvatarPaths),
    enabled: friendAvatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const invalidateSocialQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.incomingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile }),
    ]);
  }, [queryClient]);

  const handleListRefresh = useCallback(async () => {
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.incomingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.outgoingFriendRequests, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.acceptedFriends, type: 'active' }),
        queryClient.refetchQueries({ queryKey: queryKeys.currentUserProfile, type: 'active' }),
      ]);
    } catch (err) {
      console.error('Profile social refresh failed', err);
      notifyError(t('notify.refreshFailedTitle'), { message: t('notify.refreshFailedBody') });
    }
  }, [queryClient, t]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({
        type: 'active',
        predicate: (query) => {
          const key = query.queryKey[0];
          if (
            key !== queryKeys.currentUserProfile[0] &&
            key !== queryKeys.incomingFriendRequests[0] &&
            key !== queryKeys.outgoingFriendRequests[0] &&
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
    setAvatarBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        notifyError('Brak dostępu do zdjęć.', {
          message: 'Zezwól w ustawieniach systemowych.',
        });
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
      notifySuccess('Awatar zapisany.');
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'E_PICKER_CANCELLED') {
        return;
      }
      notifyDomainError(err, 'Nie udało się zapisać zdjęcia.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSendInvite = async () => {
    Keyboard.dismiss();
    const normalized = searchUsername.trim();
    if (!normalized) {
      notifyInfo('Podaj nazwę użytkownika.', { message: 'Np. @nix_friend.' });
      return;
    }

    setActionLoadingId('invite');
    try {
      const profile = await findProfileByUsername(normalized);
      if (!profile) {
        notifyError('Nie znaleziono użytkownika o takiej nazwie.');
        return;
      }

      const result = await sendFriendRequest(profile.id);
      if (result === 'request_sent') {
        notifySuccess('Zaproszenie wysłane.', { message: `Do @${profile.username}.` });
      } else if (result === 'already_requested') {
        notifyInfo('Zaproszenie już wysłane.', { message: 'Oczekuje na akceptację.' });
      } else if (result === 'already_friends') {
        notifyInfo('Już znajomi.', { message: `Z @${profile.username}.` });
      } else if (result === 'accepted_reverse_request') {
        notifySuccess('Zaproszenie zaakceptowane.', { message: `Od @${profile.username}.` });
      }

      setSearchUsername('');
      setInviteInputResetKey((prev) => prev + 1);
      Keyboard.dismiss();
      await invalidateSocialQueries();
    } catch (err: any) {
      notifyError(err?.message ?? 'Nie udało się wysłać zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAccept = async (requestId: string) => {
    setActionLoadingId(requestId);
    try {
      await acceptFriendRequest(requestId);
      await invalidateSocialQueries();
      notifySuccess('Zaproszenie zaakceptowane.');
    } catch (err: any) {
      notifyError(err?.message ?? 'Nie udało się zaakceptować zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoadingId(requestId);
    try {
      await rejectFriendRequest(requestId);
      await invalidateSocialQueries();
      notifyInfo('Zaproszenie usunięte.');
    } catch (err: any) {
      notifyError(err?.message ?? 'Nie udało się odrzucić zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNativeIncomingDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const request = requests[firstIndex];
    if (!request) return;
    if (actionLoadingId === request.id) return;
    await handleReject(request.id);
  };

  const handleCancelOutgoing = async (requestId: string) => {
    setActionLoadingId(`outgoing-${requestId}`);
    try {
      await cancelOutgoingFriendRequest(requestId);
      await invalidateSocialQueries();
      notifyInfo('Zaproszenie usunięte.');
    } catch (err: any) {
      notifyError(err?.message ?? 'Nie udało się usunąć zaproszenia.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNativeOutgoingDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const request = outgoingRequests[firstIndex];
    if (!request) return;
    const loadingId = `outgoing-${request.id}`;
    if (actionLoadingId === loadingId) return;
    await handleCancelOutgoing(request.id);
  };

  const handleNativeFriendDelete = async (indices: number[]) => {
    const firstIndex = indices[0];
    if (typeof firstIndex !== 'number') return;
    const friend = friends[firstIndex];
    if (!friend) return;
    const loadingId = `friend-${friend.id}`;
    if (actionLoadingId === loadingId) return;

    setActionLoadingId(loadingId);
    try {
      await removeFriend(friend.id);
      await invalidateSocialQueries();
      notifySuccess(`Usunięto @${friend.username} ze znajomych.`);
    } catch (err: any) {
      notifyError(err?.message ?? 'Nie udało się usunąć znajomego.');
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
              {user?.email ?? '—'}
            </Text>
          </Section>
          <Section title={t('profile.myQrCode')}>
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
                      pathname: '/profile/remove-avatar',
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
          <Section title={t('profile.addFriend')}>
            <Button label={t('profile.scanQr')} onPress={() => router.push('/friend-scan-qr')} />
            <TextField
              key={`invite-input-${inviteInputResetKey}`}
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
              label={actionLoadingId === 'invite' ? t('profile.sendInviteLoading') : t('profile.sendInvite')}
              onPress={handleSendInvite}
            />
          </Section>
          {requests.length > 0 ? (
            <Section title={t('profile.incomingInvites', { count: requests.length })}>
              <List.ForEach onDelete={handleNativeIncomingDelete}>
                {requests.map((request) => {
                  const avatarPath = request.requester.avatar_storage_path ?? null;
                  const avatarUrl = avatarPath ? incomingAvatarUrls[avatarPath] ?? null : null;
                  const fallbackInitial = request.requester.username.replace(/^@/, '').charAt(0).toUpperCase();
                  return (
                    <RNHostView matchContents key={request.id}>
                      <View style={[styles.socialRow, actionLoadingId === request.id && styles.rowDisabled]}>
                        <View style={styles.outgoingHeader}>
                          <AvatarCircle
                            size={36}
                            url={avatarUrl}
                            storagePath={avatarPath}
                            emoji={request.requester.avatar_emoji}
                            fallbackInitial={fallbackInitial}
                          />
                          <RNText numberOfLines={1} style={[styles.socialTitle, { color: colors.label, flex: 1 }]}>
                            @{request.requester.username}
                          </RNText>
                        </View>
                        <View style={styles.socialActions}>
                          <Pressable onPress={() => handleAccept(request.id)} hitSlop={8}>
                            <RNText style={[styles.socialActionLabel, { color: colors.accent }]}>Przyjmij</RNText>
                          </Pressable>
                        </View>
                      </View>
                    </RNHostView>
                  );
                })}
              </List.ForEach>
            </Section>
          ) : null}
          {outgoingRequests.length > 0 ? (
            <Section title={t('profile.outgoingInvites', { count: outgoingRequests.length })}>
              <List.ForEach onDelete={handleNativeOutgoingDelete}>
                {outgoingRequests.map((request) => {
                  const avatarPath = request.recipient.avatar_storage_path ?? null;
                  const avatarUrl = avatarPath ? outgoingAvatarUrls[avatarPath] ?? null : null;
                  const fallbackInitial = request.recipient.username.replace(/^@/, '').charAt(0).toUpperCase();
                  return (
                    <RNHostView matchContents key={request.id}>
                      <View
                        style={[
                          styles.socialRow,
                          actionLoadingId === `outgoing-${request.id}` && styles.rowDisabled,
                        ]}>
                        <View style={styles.outgoingHeader}>
                          <AvatarCircle
                            size={36}
                            url={avatarUrl}
                            storagePath={avatarPath}
                            emoji={request.recipient.avatar_emoji}
                            fallbackInitial={fallbackInitial}
                          />
                          <RNText numberOfLines={1} style={[styles.socialTitle, { color: colors.label, flex: 1 }]}>
                            @{request.recipient.username}
                          </RNText>
                        </View>
                        <RNText style={[styles.outgoingStatusLabel, { color: colors.tertiaryLabel }]}>
                          {actionLoadingId === `outgoing-${request.id}` ? 'Usuwanie…' : 'Oczekuje na akceptację'}
                        </RNText>
                      </View>
                    </RNHostView>
                  );
                })}
              </List.ForEach>
            </Section>
          ) : null}
          <Section title={t('profile.friends', { count: friends.length })}>
            {friends.length === 0 ? (
              <Text
                modifiers={[
                  foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  listRowSeparator('hidden'),
                ]}>
                Nie masz jeszcze znajomych.
              </Text>
            ) : (
              <List.ForEach onDelete={handleNativeFriendDelete}>
                {friends.map((friend) => {
                  const avatarPath = friend.avatar_storage_path ?? null;
                  const avatarUrl = avatarPath ? friendAvatarUrls[avatarPath] ?? null : null;
                  const fallbackInitial = friend.username.replace(/^@/, '').charAt(0).toUpperCase();
                  return (
                    <RNHostView matchContents key={friend.id}>
                      <View
                        style={[
                          styles.socialRow,
                          actionLoadingId === `friend-${friend.id}` && styles.rowDisabled,
                        ]}>
                        <View style={styles.outgoingHeader}>
                          <AvatarCircle
                            size={36}
                            url={avatarUrl}
                            storagePath={avatarPath}
                            emoji={friend.avatar_emoji}
                            fallbackInitial={fallbackInitial}
                          />
                          <RNText numberOfLines={1} style={[styles.socialTitle, { color: colors.label, flex: 1 }]}>
                            @{friend.username}
                          </RNText>
                        </View>
                      </View>
                    </RNHostView>
                  );
                })}
              </List.ForEach>
            )}
          </Section>
          <Section title={t('profile.account')}>
            <Button label={t('profile.changePassword')} onPress={() => router.push('/profile/change-password')} />
            <Button label={t('profile.signOut')} onPress={handleSignOut} />
          </Section>
        </List>
        <Stack.Screen.Title large>{t('profile.title')}</Stack.Screen.Title>
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
    ...SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING,
  },
  socialTitle: {
    ...typography.headline,
  },
  socialActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  socialActionLabel: {
    ...typography.headline,
    fontWeight: '600',
  },
  outgoingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  outgoingStatusLabel: {
    ...typography.footnote,
    paddingLeft: 46,
  },
  rowDisabled: {
    opacity: 0.82,
  },
});
