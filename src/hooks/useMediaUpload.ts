import { useState } from 'react';
import { uploadImageAndCreateSnap } from '../services/mediaService';
import { toDomainError } from '../services/errors';

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

  return { uploadSnap, isUploading, error };
}
