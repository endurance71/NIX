import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { usePushNotifications } from '../context/pushNotifications';
import { queryKeys } from '../lib/queryKeys';
import { readRecipientSnapshot } from '../lib/recipientSnapshot';
import { appNotificationQueue } from '../lib/notificationQueue';
import { memoryCaptureDecision, memoryRecipientNames, type MemoryRecipientProfile } from '../lib/memories';
import { getPushPromptOffers } from '../services/pushNotificationService';
import {
  discardStagedMemoryItems,
  getMemoriesPreference,
  saveStagedMemories,
  setMemoriesPreference,
  stageMemoryItems,
  type MemoryCaptureItem,
} from '../services/memoriesStore';

/** One prompt per app session at most, even across several send screens. */
let promptInFlight = false;
const PROMPT_DELAY_MS = 900;

/**
 * Post-send hook of `useSendMedia`: copies the baked delivery files of a successfully queued send
 * into the private Memories album when the user opted in, or asks once („Zapisywać…?”) while the
 * choice is still open. Fire-and-forget: it never throws and never delays the send.
 */
export function useMemoriesCapture() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { state: pushState } = usePushNotifications();
  const userId = user?.id ?? null;
  // Latest owner, read after the prompt delay: a sign-out meanwhile must drop the staged copies.
  const ownerRef = useRef<string | null>(userId);
  useEffect(() => {
    ownerRef.current = userId;
  }, [userId]);

  const recipientNames = async (ownerId: string, recipientIds: readonly string[]) => {
    const cached = queryClient.getQueryData<MemoryRecipientProfile[]>(queryKeys.acceptedFriends);
    let names = memoryRecipientNames(recipientIds, cached ?? []);
    if (names.length < recipientIds.length) {
      const snapshot = await readRecipientSnapshot(ownerId).catch(() => null);
      if (snapshot) names = memoryRecipientNames(recipientIds, [...(cached ?? []), ...snapshot.recipients]);
    }
    return names;
  };

  const capture = async (items: readonly MemoryCaptureItem[], recipientIds: readonly string[]) => {
    const ownerId = userId;
    if (!ownerId || items.length === 0) return;
    const preference = await getMemoriesPreference(ownerId);
    if (preference === 'off') return;
    let pushRationaleMayShow = false;
    if (preference === 'unset' && (pushState === 'disabled' || pushState === 'error')) {
      const offers = await getPushPromptOffers(ownerId).catch(() => ({ onboarding: true, afterSend: true }));
      pushRationaleMayShow = !offers.afterSend;
    }
    const decision = memoryCaptureDecision(preference, pushRationaleMayShow, promptInFlight);
    if (decision === 'skip') return;
    if (decision === 'save') {
      // Copy first: the draft files can disappear once the preview closes.
      const staged = await stageMemoryItems(items);
      if (staged.length > 0) await saveStagedMemories(ownerId, staged, await recipientNames(ownerId, recipientIds));
      return;
    }
    promptInFlight = true;
    let staged: Awaited<ReturnType<typeof stageMemoryItems>> = [];
    let names: string[] = [];
    try {
      staged = await stageMemoryItems(items);
      names = await recipientNames(ownerId, recipientIds);
      await new Promise((resolve) => setTimeout(resolve, PROMPT_DELAY_MS));
      await appNotificationQueue.whenSettled();
    } catch (error) {
      promptInFlight = false;
      discardStagedMemoryItems(staged);
      throw error;
    }
    if (staged.length === 0 || ownerRef.current !== ownerId) {
      promptInFlight = false;
      discardStagedMemoryItems(staged);
      return;
    }
    Alert.alert(t('memories.promptTitle'), t('memories.promptMessage'), [
      {
        text: t('memories.promptDecline'),
        style: 'cancel',
        onPress: () => {
          promptInFlight = false;
          discardStagedMemoryItems(staged);
          void setMemoriesPreference(ownerId, false).catch(() => {});
        },
      },
      {
        text: t('memories.promptAccept'),
        onPress: () => {
          promptInFlight = false;
          void setMemoriesPreference(ownerId, true).catch(() => {});
          void saveStagedMemories(ownerId, staged, names);
        },
      },
    ], { cancelable: false });
  };

  return (items: readonly MemoryCaptureItem[], recipientIds: readonly string[]) => {
    void capture(items, recipientIds).catch((error) => {
      console.warn('[memories] capture failed', error);
    });
  };
}
