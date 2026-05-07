import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { clearProfileAvatar } from '../../../services/avatarService';
import { queryKeys } from '../../../lib/queryKeys';
import { ConfirmationSheet } from '../../../components/ui/confirmation-sheet';
import { notifyDomainError, notifySuccess } from '../../../lib/appNotify';

export default function RemoveAvatarSheet() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    avatarUrl?: string;
    avatarStoragePath?: string;
    avatarEmoji?: string;
    fallbackInitial?: string;
  }>();

  const avatarUrl = params.avatarUrl ?? null;
  const avatarStoragePath = params.avatarStoragePath ?? null;
  const avatarEmoji = params.avatarEmoji ?? null;
  const fallbackInitial = params.fallbackInitial ?? null;

  const handleConfirm = async () => {
    try {
      await clearProfileAvatar();
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle });
      notifySuccess('Awatar usunięty.');
      router.back();
    } catch (err: unknown) {
      notifyDomainError(err, 'Nie udało się usunąć awatara.');
      throw err;
    }
  };

  return (
    <ConfirmationSheet
      title="Usunąć awatar?"
      message="Po usunięciu wrócisz do domyślnego widoku profilu."
      avatarUrl={avatarUrl}
      avatarStoragePath={avatarStoragePath}
      avatarEmoji={avatarEmoji}
      fallbackInitial={fallbackInitial}
      primaryActionLabel="Usuń awatar"
      primaryActionLoadingLabel="Usuwanie..."
      onConfirm={handleConfirm}
    />
  );
}
