import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './useAuth';
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
} from '../services/friendService';
import { AVATAR_SIGNED_URL_STALE_TIME_MS, createSignedAvatarUrls, uploadProfileAvatarFromUri } from '../services/avatarService';
import { getCurrentUserProfile } from '../services/profileService';
import { useAppTheme } from './useAppTheme';
import { useProfileQrPayload } from './useProfileQrPayload';
import { avatarSignedUrlsQueryKey, queryKeys } from '../lib/queryKeys';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess } from '../lib/appNotify';
import { useTranslation } from 'react-i18next';
import {
  listCapturePoliciesForFriends,
  upsertCapturePolicyForFriend,
  type CapturePolicy,
} from '../services/capturePolicyService';
import { resolveCapturePolicyForFriend } from '../lib/capturePolicy';

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

export function useProfileScreen() {
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
          outgoingRequests.flatMap((request) =>
            request.recipient.avatar_storage_path ? [request.recipient.avatar_storage_path] : []
          )
        )
      ),
    [outgoingRequests]
  );
  const incomingAvatarPaths = useMemo(
    () =>
      Array.from(
        new Set(
          requests.flatMap((request) =>
            request.requester.avatar_storage_path ? [request.requester.avatar_storage_path] : []
          )
        )
      ),
    [requests]
  );
  const friendAvatarPaths = useMemo(
    () =>
      Array.from(
        new Set(friends.flatMap((friend) => (friend.avatar_storage_path ? [friend.avatar_storage_path] : [])))
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
  const friendIds = useMemo(() => friends.map((friend) => friend.id), [friends]);
  const friendCapturePoliciesQueryKey = useMemo(
    () => queryKeys.friendCapturePolicies(friendIds),
    [friendIds]
  );
  const { data: friendCapturePolicies = {} } = useQuery({
    queryKey: friendCapturePoliciesQueryKey,
    queryFn: () => listCapturePoliciesForFriends(friendIds),
    enabled: friendIds.length > 0,
    staleTime: 60_000,
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
  const resolveFriendCapturePolicy = useCallback(
    (friendId: string): CapturePolicy => resolveCapturePolicyForFriend(friendCapturePolicies, friendId),
    [friendCapturePolicies]
  );

  const handleToggleFriendCapture = useCallback(
    async (friendId: string, nextAllowed: boolean) => {
      const nextPolicy: CapturePolicy = nextAllowed ? 'allow' : 'deny';
      const loadingId = `capture-${friendId}`;
      if (actionLoadingId === loadingId) return;

      const previousPolicies = (queryClient.getQueryData(friendCapturePoliciesQueryKey) as Record<string, CapturePolicy>) ?? {};
      queryClient.setQueryData(friendCapturePoliciesQueryKey, {
        ...previousPolicies,
        [friendId]: nextPolicy,
      });
      setActionLoadingId(loadingId);

      try {
        await upsertCapturePolicyForFriend(friendId, nextPolicy);
        await queryClient.invalidateQueries({ queryKey: friendCapturePoliciesQueryKey });
      } catch (err: any) {
        queryClient.setQueryData(friendCapturePoliciesQueryKey, previousPolicies);
        notifyError(err?.message ?? 'Nie udało się zapisać preferencji screenshotów.');
      } finally {
        setActionLoadingId(null);
      }
    },
    [actionLoadingId, friendCapturePoliciesQueryKey, queryClient]
  );

  return {
    profilePending,
    colors,
    statusBarStyle,
    t,
    user,
    profileUsername,
    qrPayload,
    profileRow,
    avatarSignedUrl,
    avatarBusy,
    hasAvatar,
    initialLetter,
    searchUsername,
    setSearchUsername,
    inviteInputResetKey,
    handlePickAvatarPhoto,
    handleSendInvite,
    handleListRefresh,
    requests,
    outgoingRequests,
    friends,
    actionLoadingId,
    incomingAvatarUrls,
    outgoingAvatarUrls,
    friendAvatarUrls,
    handleAccept,
    handleReject,
    handleNativeIncomingDelete,
    handleCancelOutgoing,
    handleNativeOutgoingDelete,
    handleNativeFriendDelete,
    resolveFriendCapturePolicy,
    handleToggleFriendCapture,
    handleSignOut,
  };
}
