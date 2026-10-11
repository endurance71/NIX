import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVideoDraft } from '../context/videoDraft';
import { usePhotoDraft } from '../context/photoDraft';
import { useUploadQueueActions } from '../context/uploadQueue';
import { usePushNotifications } from '../context/pushNotifications';
import { bakeMediaOverlays } from '../lib/bakeMediaTextOverlay';
import { normalizeMediaTextOverlay } from '../types/mediaTextOverlay';
import { normalizeMediaDrawingOverlay } from '../types/mediaDrawingOverlay';
import { mediaEditingViewport } from '../lib/mediaPresentation';
import { clearDraftWhenPreviewCloses } from '../lib/previewDraftLifecycle';
import { notifyDomainError } from '../lib/appNotify';
import { runWithFinally } from '../lib/runWithFinally';
import { tap } from '../lib/haptics';
import type { NixViewDurationSec } from '../lib/nixViewDuration';
import { useMemoriesCapture } from './useMemoriesCapture';
import type { MemoryCaptureItem } from '../services/memoriesStore';

function throwRejectedResult(result: PromiseRejectedResult | undefined) {
  if (result) throw result.reason;
}

type VideoSegment = NonNullable<ReturnType<typeof useVideoDraft>['segments']>[number];
type SegmentRecipient = { receiverId: string; viewDurationSec: number; sequenceIndex: number };

/**
 * Bakes overlays straight into the delivery profile so the queue can skip a second transcode
 * (PERF-23; `deliveryReady` is false when the encoder overshot) and passes the known size so the
 * queue's fast path applies (PERF-22): the capture size for an untouched clip, the export size
 * for a delivery-ready bake. Any other baked copy is left for the queue to treat as unknown.
 */
async function prepareVideoSegmentInputs({
  segments,
  recipients,
  textOverlay,
  drawingOverlay,
  viewportWidth,
  viewportHeight,
  signal,
}: {
  segments: readonly VideoSegment[];
  recipients: readonly SegmentRecipient[];
  textOverlay: ReturnType<typeof normalizeMediaTextOverlay>;
  drawingOverlay: ReturnType<typeof normalizeMediaDrawingOverlay>;
  viewportWidth: number;
  viewportHeight: number;
  signal: AbortSignal;
}) {
  const bakedSegments = await Promise.all(
    segments.map(async (segment) => {
      const mediaViewport = mediaEditingViewport({
        media: segment,
        viewportWidth,
        viewportHeight,
        captureOrientation: segment.captureOrientation,
      });
      const baked = await bakeMediaOverlays({
        uri: segment.uri,
        mediaType: 'video',
        textOverlay,
        drawingOverlay,
        viewportWidth: mediaViewport.width,
        viewportHeight: mediaViewport.height,
        videoTarget: 'delivery',
        signal,
      });
      return { segment, baked };
    }),
  );
  return bakedSegments.map(({ segment, baked }, sequenceIndex) => {
    const knownSize = baked.deliveryReady
      ? { width: baked.width ?? undefined, height: baked.height ?? undefined }
      : baked.didBake
        ? { width: undefined, height: undefined }
        : { width: segment.width, height: segment.height };
    return {
      fileUri: baked.uri,
      mediaType: 'video' as const,
      recipients: recipients.map((recipient) => ({ ...recipient, sequenceIndex })),
      playbackDurationMs: baked.deliveryReady
        ? baked.durationMs ?? segment.durationMs
        : segment.durationMs,
      sourceWidth: knownSize.width,
      sourceHeight: knownSize.height,
    };
  });
}

export type SendMediaArgs = {
  recipientIds: readonly string[];
  viewDurationSec: NixViewDurationSec;
  /** After queueing, go back to this chat instead of the inbox. */
  returnToPeerId?: string;
};

/**
 * Bakes the current photo/video draft (with its text and drawing) and queues it for the given
 * recipients. Shared by the „Send to” sheet and the preview's direct „Send to @x”.
 *
 * - Video is baked straight into the delivery profile (PERF-22/23); the export is aborted when the
 *   screen unmounts.
 * - When any enqueue fails, the jobs already queued for this send are cancelled (rollback).
 * - No „Sent” toast: the upload has only been queued; rows/bubbles show the honest status.
 * - Navigation happens only while the calling screen is still focused (SEND-11).
 */
export function useSendMedia({ isVideo, photoUri }: { isVideo: boolean; photoUri?: string }) {
  const { t } = useTranslation();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { draft: draftPhoto, clearDraft: clearPhotoDraft } = usePhotoDraft();
  const {
    segments,
    clearSegments,
    textOverlay: videoTextOverlay,
    drawingOverlay: videoDrawingOverlay,
  } = useVideoDraft();
  const { enqueueMediaBatch, cancelUpload } = useUploadQueueActions();
  const { offerAfterSuccessfulSend } = usePushNotifications();
  const captureMemories = useMemoriesCapture();
  const [isSending, setIsSending] = useState(false);
  const sendLockRef = useRef(false);
  const bakeAbortRef = useRef<AbortController | null>(null);
  // Leaving the screen (e.g. a deep link replaced the stack) stops an in-flight video export.
  useEffect(() => () => bakeAbortRef.current?.abort(), []);
  // Baking overlays and staging can take seconds; if the screen stopped being the visible one
  // meanwhile (blurred or removed), finishing the send must not navigate from wherever the user
  // is now (SEND-11).
  const screenActiveRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      screenActiveRef.current = true;
      return () => {
        screenActiveRef.current = false;
      };
    }, []),
  );

  const canSend = isVideo ? Boolean(segments?.length) : Boolean(photoUri);

  const send = async ({ recipientIds, viewDurationSec, returnToPeerId }: SendMediaArgs) => {
    if (recipientIds.length === 0 || isSending || sendLockRef.current) return;
    if (!isVideo && !photoUri) return;
    if (isVideo && (!segments?.length || segments.length === 0)) return;

    tap('medium');
    sendLockRef.current = true;
    setIsSending(true);
    const bakeAbort = new AbortController();
    bakeAbortRef.current = bakeAbort;

    const recipients = recipientIds.map((receiverId) => ({
      receiverId,
      viewDurationSec,
      sequenceIndex: 0,
    }));
    const enqueuedJobIds: string[] = [];
    let memoryItems: MemoryCaptureItem[] = [];
    await runWithFinally(
      async () => {
        try {
          const textOverlay = isVideo
            ? normalizeMediaTextOverlay(videoTextOverlay)
            : normalizeMediaTextOverlay(draftPhoto?.textOverlay);
          const drawingOverlay = isVideo
            ? normalizeMediaDrawingOverlay(videoDrawingOverlay)
            : normalizeMediaDrawingOverlay(draftPhoto?.drawingOverlay);

          if (isVideo) {
            const segmentInputs = await prepareVideoSegmentInputs({
              segments: segments!,
              recipients,
              textOverlay,
              drawingOverlay,
              viewportWidth,
              viewportHeight,
              signal: bakeAbort.signal,
            });
            const results = await Promise.allSettled(
              segmentInputs.map((input) => enqueueMediaBatch(input)),
            );
            for (const result of results) {
              if (result.status === 'fulfilled') enqueuedJobIds.push(result.value.jobId);
            }
            const failedResult = results.find(
              (result): result is PromiseRejectedResult => result.status === 'rejected',
            );
            throwRejectedResult(failedResult);
            memoryItems = segmentInputs.map((input) => ({
              uri: input.fileUri,
              mediaType: 'video' as const,
              durationMs: input.playbackDurationMs ?? null,
              width: input.sourceWidth ?? null,
              height: input.sourceHeight ?? null,
            }));
          } else {
            const mediaViewport = mediaEditingViewport({
              media: draftPhoto ?? {},
              viewportWidth,
              viewportHeight,
              captureOrientation: draftPhoto?.captureOrientation,
            });
            const baked = await bakeMediaOverlays({
              uri: photoUri!,
              mediaType: 'image',
              textOverlay,
              drawingOverlay,
              viewportWidth: mediaViewport.width,
              viewportHeight: mediaViewport.height,
            });
            const result = await enqueueMediaBatch({
              fileUri: baked.uri,
              mediaType: 'image',
              recipients,
              // After bake dimensions may change slightly; omit to force safe re-encode path when baked.
              sourceWidth: baked.didBake ? undefined : draftPhoto?.width,
              sourceHeight: baked.didBake ? undefined : draftPhoto?.height,
            });
            enqueuedJobIds.push(result.jobId);
            memoryItems = [{
              uri: baked.uri,
              mediaType: 'image',
              width: baked.didBake ? null : draftPhoto?.width ?? null,
              height: baked.didBake ? null : draftPhoto?.height ?? null,
            }];
          }

          // Memories („Wspomnienia”): the exact delivery files the recipients get, only after every
          // job was queued; opt-in, staged + encrypted in the background, never blocks the send.
          captureMemories(memoryItems, recipientIds);
          clearDraftWhenPreviewCloses(isVideo ? clearSegments : clearPhotoDraft);
          // No „Sent” toast here: the upload has only been queued. Progress and the real result
          // are shown on the row/bubble (and the success haptic fires when the batch completes).
          if (!screenActiveRef.current) return;
          if (returnToPeerId) {
            router.dismissTo({ pathname: '/chat/[peerId]', params: { peerId: returnToPeerId } });
          } else {
            router.dismissAll();
            router.replace('/(tabs)/inbox');
          }
          setTimeout(() => void offerAfterSuccessfulSend(), 400);
        } catch (err) {
          await Promise.all(
            enqueuedJobIds.map((jobId) => cancelUpload(jobId).catch(() => undefined)),
          );
          // The screen went away mid-export: nothing to report.
          if (bakeAbort.signal.aborted) return;
          notifyDomainError(err, t('sendTo.enqueueFailureTitle'));
        }
      },
      () => {
        if (bakeAbortRef.current === bakeAbort) bakeAbortRef.current = null;
        setIsSending(false);
        sendLockRef.current = false;
      },
    );
  };

  return { send, isSending, canSend };
}
