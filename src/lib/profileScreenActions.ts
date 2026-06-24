import { Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { QueryClient } from '@tanstack/react-query';
import {
  acceptFriendRequest,
  cancelOutgoingFriendRequest,
  findProfileByUsername,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../services/friendService';
import { uploadProfileAvatarFromUri } from '../services/avatarService';
import { notifyDomainError, notifyError, notifyInfo, notifySuccess } from '../lib/appNotify';
import { upsertCapturePolicyForFriend, type CapturePolicy } from '../services/capturePolicyService';

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

export async function pickProfileAvatarPhoto(invalidateSocialQueries: () => Promise<void>): Promise<void> {
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
}

export async function sendProfileInvite(
  searchUsername: string,
  invalidateSocialQueries: () => Promise<void>,
  onSuccess: () => void
): Promise<void> {
  Keyboard.dismiss();
  const normalized = searchUsername.trim();
  if (!normalized) {
    notifyInfo('Podaj nazwę użytkownika.', { message: 'Np. @nix_friend.' });
    return;
  }

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

  onSuccess();
  Keyboard.dismiss();
  await invalidateSocialQueries();
}

export async function acceptProfileFriendRequest(
  requestId: string,
  invalidateSocialQueries: () => Promise<void>
): Promise<void> {
  await acceptFriendRequest(requestId);
  await invalidateSocialQueries();
  notifySuccess('Zaproszenie zaakceptowane.');
}

export async function rejectProfileFriendRequest(
  requestId: string,
  invalidateSocialQueries: () => Promise<void>
): Promise<void> {
  await rejectFriendRequest(requestId);
  await invalidateSocialQueries();
  notifyInfo('Zaproszenie usunięte.');
}

export async function cancelProfileOutgoingRequest(
  requestId: string,
  invalidateSocialQueries: () => Promise<void>
): Promise<void> {
  await cancelOutgoingFriendRequest(requestId);
  await invalidateSocialQueries();
  notifyInfo('Zaproszenie usunięte.');
}

export async function removeProfileFriend(
  friendId: string,
  username: string,
  invalidateSocialQueries: () => Promise<void>
): Promise<void> {
  await removeFriend(friendId);
  await invalidateSocialQueries();
  notifySuccess(`Usunięto @${username} ze znajomych.`);
}

export async function toggleProfileFriendCapture(
  friendId: string,
  nextPolicy: CapturePolicy,
  queryClient: QueryClient,
  friendCapturePoliciesQueryKey: readonly unknown[]
): Promise<void> {
  const previousPolicies =
    (queryClient.getQueryData(friendCapturePoliciesQueryKey) as Record<string, CapturePolicy>) ?? {};
  queryClient.setQueryData(friendCapturePoliciesQueryKey, {
    ...previousPolicies,
    [friendId]: nextPolicy,
  });

  try {
    await upsertCapturePolicyForFriend(friendId, nextPolicy);
    await queryClient.invalidateQueries({ queryKey: friendCapturePoliciesQueryKey });
  } catch (err: unknown) {
    queryClient.setQueryData(friendCapturePoliciesQueryKey, previousPolicies);
    notifyError((err as { message?: string })?.message ?? 'Nie udało się zapisać preferencji screenshotów.');
    throw err;
  }
}

export function handleProfileAvatarPickError(err: unknown): void {
  if ((err as { code?: string })?.code === 'E_PICKER_CANCELLED') {
    return;
  }
  notifyDomainError(err, 'Nie udało się zapisać zdjęcia.');
}
