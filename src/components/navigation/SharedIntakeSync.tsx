import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import {
  pickPendingSharedFile,
  SHARED_INTAKE_APP_GROUP,
  SHARED_INTAKE_FOLDER,
} from '../../lib/sharedIntake';

/** Dev builds print the share extension's step log once, then clear it. */
function flushShareDebugLog() {
  if (!__DEV__) return;
  const container = Paths.appleSharedContainers[SHARED_INTAKE_APP_GROUP];
  if (!container) return;
  const log = new File(container, SHARED_INTAKE_FOLDER, 'share-debug.log');
  if (!log.exists) return;
  console.info('[NixShareExtension]\n' + log.textSync());
  log.delete();
}

function pendingFiles() {
  const container = Paths.appleSharedContainers[SHARED_INTAKE_APP_GROUP];
  if (!container) return [];
  const folder = new Directory(container, SHARED_INTAKE_FOLDER);
  if (!folder.exists) return [];
  return folder
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => {
      const info = file.info();
      // iOS may report no creation time (the modification time is the copy time here), and some
      // versions report seconds rather than milliseconds.
      const raw = info.creationTime ?? info.modificationTime ?? Date.now();
      return { name: file.name, createdAtMs: raw < 1e12 ? raw * 1000 : raw };
    });
}

/**
 * Picks up a photo or video shared to NiX when iOS did not let the share extension open the app
 * (the user opens NiX or taps the extension's notification instead). Renders nothing.
 */
export function SharedIntakeSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/share-intake' || pathname === '/preview') return;
    const check = () => {
      try {
        flushShareDebugLog();
        const pending = pickPendingSharedFile(pendingFiles(), Date.now());
        if (pending) {
          router.push({ pathname: '/share-intake', params: { file: pending.fileName, kind: pending.kind } });
        }
      } catch (error) {
        console.warn('Shared intake check failed', error);
      }
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [pathname]);

  return null;
}
