import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UploadQueueNixeshot } from '../types/uploadQueue';

const STORAGE_KEY = 'nix.upload_queue.v1';
const NIXESHOT_VERSION = 1;

function sanitizeNixeshot(value: unknown): UploadQueueNixeshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<UploadQueueNixeshot>;
  if (candidate.version !== NIXESHOT_VERSION) return null;
  if (!Array.isArray(candidate.tasks)) return null;
  if (typeof candidate.updatedAt !== 'number') return null;
  return {
    version: NIXESHOT_VERSION,
    tasks: candidate.tasks,
    activeTaskId: typeof candidate.activeTaskId === 'string' ? candidate.activeTaskId : null,
    paused: Boolean(candidate.paused),
    updatedAt: candidate.updatedAt,
  };
}

export async function readUploadQueueNixeshot(): Promise<UploadQueueNixeshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeNixeshot(parsed);
  } catch {
    return null;
  }
}

export async function writeUploadQueueNixeshot(nixeshot: UploadQueueNixeshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nixeshot));
}

export async function clearUploadQueueNixeshot(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
