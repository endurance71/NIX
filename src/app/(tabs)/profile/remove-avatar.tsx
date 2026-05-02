import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { clearProfileAvatar } from '../../../services/avatarService';
import { queryKeys } from '../../../lib/queryKeys';
import { ConfirmationSheet } from '../../../components/ui/confirmation-sheet';

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
    await clearProfileAvatar();
    void queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSnapsBundle });
    router.back();
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
