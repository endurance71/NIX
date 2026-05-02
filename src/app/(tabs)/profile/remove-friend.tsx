import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { removeFriend } from '../../../services/friendService';
import { queryKeys } from '../../../lib/queryKeys';
import { createSignedAvatarUrl } from '../../../services/avatarService';
import { ConfirmationSheet } from '../../../components/ui/confirmation-sheet';

export default function RemoveFriendSheet() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    friendId?: string;
    username?: string;
    avatarStoragePath?: string;
    avatarEmoji?: string;
    fallbackInitial?: string;
  }>();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  const username = params.username ?? 'znajomego';
  const friendId = params.friendId ?? '';
  const avatarStoragePath = params.avatarStoragePath ?? null;
  const avatarEmoji = params.avatarEmoji ?? null;
  const fallbackInitial = params.fallbackInitial ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!avatarStoragePath) {
      setAvatarUrl(null);
      return () => {
        cancelled = true;
      };
    }
    createSignedAvatarUrl(avatarStoragePath)
      .then((url) => {
        if (!cancelled) setAvatarUrl(url);
      })
      .catch((err) => {
        console.warn('Nie udało się pobrać signed URL avatara znajomego', err);
        if (!cancelled) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarStoragePath]);

  const handleConfirm = async () => {
    if (!friendId) return;
    await removeFriend(friendId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle });
    router.back();
  };

  return (
    <ConfirmationSheet
      title={`Usunąć @${username}?`}
      message="Ta osoba zniknie z Twojej listy znajomych."
      avatarUrl={avatarUrl}
      avatarStoragePath={avatarStoragePath}
      avatarEmoji={avatarEmoji}
      fallbackInitial={fallbackInitial}
      primaryActionLabel="Usuń znajomego"
      primaryActionLoadingLabel="Usuwanie..."
      onConfirm={handleConfirm}
    />
  );
}
