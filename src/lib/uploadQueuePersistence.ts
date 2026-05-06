import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UploadQueueSnapshot } from '../types/uploadQueue';

const STORAGE_KEY = 'nix.upload_queue.v1';
const SNAPSHOT_VERSION = 1;

function sanitizeSnapshot(value: unknown): UploadQueueSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<UploadQueueSnapshot>;
  if (candidate.version !== SNAPSHOT_VERSION) return null;
  if (!Array.isArray(candidate.tasks)) return null;
  if (typeof candidate.updatedAt !== 'number') return null;
  return {
    version: SNAPSHOT_VERSION,
    tasks: candidate.tasks,
    activeTaskId: typeof candidate.activeTaskId === 'string' ? candidate.activeTaskId : null,
    paused: Boolean(candidate.paused),
    updatedAt: candidate.updatedAt,
  };
}

export async function readUploadQueueSnapshot(): Promise<UploadQueueSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeSnapshot(parsed);
  } catch {
    return null;
  }
}

export async function writeUploadQueueSnapshot(snapshot: UploadQueueSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export async function clearUploadQueueSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
