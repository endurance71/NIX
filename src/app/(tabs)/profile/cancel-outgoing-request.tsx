import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { cancelOutgoingFriendRequest } from '../../../services/friendService';
import { createSignedAvatarUrl } from '../../../services/avatarService';
import { queryKeys } from '../../../lib/queryKeys';
import { notifyError, notifyInfo } from '../../../lib/appNotify';
import { ConfirmationSheet } from '../../../components/ui/confirmation-sheet';

export default function CancelOutgoingRequestSheet() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    requestId?: string;
    username?: string;
    avatarStoragePath?: string;
    avatarEmoji?: string;
    fallbackInitial?: string;
  }>();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const requestId = params.requestId ?? '';
  const username = params.username ?? 'użytkownika';
  const avatarStoragePath = params.avatarStoragePath ?? null;
  const avatarEmoji = params.avatarEmoji ?? null;
  const fallbackInitial = params.fallbackInitial ?? username;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!avatarStoragePath) {
        if (!cancelled) setAvatarUrl(null);
        return;
      }

      try {
        const signedUrl = await createSignedAvatarUrl(avatarStoragePath);
        if (!cancelled) setAvatarUrl(signedUrl);
      } catch (err) {
        console.warn('Nie udało się pobrać signed URL avatara zaproszenia', err);
        if (!cancelled) setAvatarUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [avatarStoragePath]);

  const handleConfirm = async () => {
    if (!requestId) {
      notifyError('Brak danych zaproszenia.');
      return;
    }

    try {
      await cancelOutgoingFriendRequest(requestId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.outgoingFriendRequests });
      notifyInfo('Zaproszenie anulowane.');
      router.back();
    } catch (err: unknown) {
      notifyError((err as { message?: string })?.message ?? 'Nie udało się anulować zaproszenia.');
      throw err;
    }
  };

  return (
    <ConfirmationSheet
      title={`Anulować zaproszenie do @${username}?`}
      message="Ta osoba nie zobaczy już oczekującego zaproszenia od Ciebie."
      avatarUrl={avatarUrl}
      avatarStoragePath={avatarStoragePath}
      avatarEmoji={avatarEmoji}
      fallbackInitial={fallbackInitial}
      primaryActionLabel="Anuluj zaproszenie"
      primaryActionLoadingLabel="Anuluj zaproszenie"
      onConfirm={handleConfirm}
    />
  );
}
