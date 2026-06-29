import { useState } from 'react';
import { router } from 'expo-router';
import { AvatarCircle } from './avatar-circle';
import { tap } from '../../lib/haptics';
import {
  ACTION_SHEET_AVATAR_SIZE,
  ActionSheetPrimaryButton,
  ActionSheetSecondaryButton,
  ActionSheetSurface,
} from './action-sheet-surface';

type ConfirmationSheetProps = {
  title: string;
  message: string;
  avatarUrl?: string | null;
  avatarStoragePath?: string | null;
  avatarEmoji?: string | null;
  fallbackInitial?: string | null;
  destructive?: boolean;
  primaryActionLabel: string;
  primaryActionLoadingLabel: string;
  onConfirm: () => Promise<void>;
};

export function ConfirmationSheet({
  title,
  message,
  avatarUrl,
  avatarStoragePath,
  avatarEmoji,
  fallbackInitial,
  destructive = true,
  primaryActionLabel,
  primaryActionLoadingLabel,
  onConfirm,
}: ConfirmationSheetProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (loading) return;
    tap('heavy');
    setLoading(true);
    try {
      await onConfirm();
    } catch (err) {
      console.error('Confirmation action failed', err);
      setLoading(false);
    }
  };

  return (
    <ActionSheetSurface
      title={title}
      message={message}
      actions={
        <>
          <ActionSheetPrimaryButton
            label={primaryActionLabel}
            loadingLabel={primaryActionLoadingLabel}
            loading={loading}
            destructive={destructive}
            onPress={handleConfirm}
          />
          <ActionSheetSecondaryButton onPress={() => router.back()} disabled={loading} />
        </>
      }
    >
      <AvatarCircle
        size={ACTION_SHEET_AVATAR_SIZE}
        url={avatarUrl}
        storagePath={avatarStoragePath}
        emoji={avatarEmoji}
        fallbackInitial={fallbackInitial}
      />
    </ActionSheetSurface>
  );
}
