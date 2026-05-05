import { useState } from 'react';
import { uploadImageAndCreateSnap, uploadVideoAndCreateSnap } from '../services/mediaService';
import { toDomainError } from '../services/errors';
import type { VideoSegmentDraft } from '../context/VideoDraftContext';

export function useMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadSnap = async (fileUri: string, receiverId: string, viewDurationSec = 5) => {
    setIsUploading(true);
    setError(null);

    try {
      await uploadImageAndCreateSnap(fileUri, receiverId, viewDurationSec);

      return { success: true };
    } catch (err) {
      const domainError = toDomainError(err, 'Nie udało się przesłać wiadomości.');
      console.error('Przesyłanie nie powiodło się:', err);
      setError(domainError.message);
      return { success: false, error: domainError.message };
    } finally {
      setIsUploading(false);
    }
  };

  /** Kolejność segmentów = kolejność insertów (FIFO u odbiorcy). */
  const uploadVideoSegments = async (
    segments: VideoSegmentDraft[],
    receiverId: string,
    viewDurationSec = 5
  ) => {
    setIsUploading(true);
    setError(null);

    try {
      for (const seg of segments) {
        await uploadVideoAndCreateSnap(seg.uri, receiverId, seg.durationMs, viewDurationSec);
      }
      return { success: true };
    } catch (err) {
      const domainError = toDomainError(err, 'Nie udało się przesłać wiadomości.');
      console.error('Przesyłanie wideo nie powiodło się:', err);
      setError(domainError.message);
      return { success: false, error: domainError.message };
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadSnap, uploadVideoSegments, isUploading, error };
}
