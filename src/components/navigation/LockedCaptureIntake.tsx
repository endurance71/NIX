import { useEffect } from 'react';
import { AppState, Image } from 'react-native';
import { router } from 'expo-router';
import { consumeLockedCapturesAsync } from '../../../modules/nix-camera-torch';
import { usePhotoDraft } from '../../context/photoDraft';

/**
 * Picks up photos taken with the Lock Screen camera (NixCaptureExtension) when the app becomes
 * active and opens the newest one in the preview. Renders nothing.
 */
export function LockedCaptureIntake() {
  const { setDraft: setPhotoDraft } = usePhotoDraft();

  useEffect(() => {
    let busy = false;
    const intake = async () => {
      if (busy) return;
      busy = true;
      // No try/finally: the React Compiler does not support `finally` clauses.
      const photos = await consumeLockedCapturesAsync().catch(() => [] as string[]);
      busy = false;
      const newest = photos[photos.length - 1];
      if (!newest) return;
      Image.getSize(newest, (width, height) => {
        setPhotoDraft({ uri: newest, width, height });
        router.push('/preview');
      });
    };
    void intake();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void intake();
    });
    return () => subscription.remove();
  }, [setPhotoDraft]);

  return null;
}
