import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '../services/profileService';
import { markNixViewedWithCleanup } from '../services/nixService';
import { trackEvent } from './telemetry';

const STORAGE_PREFIX = 'nix.viewed_ack_queue.v1';
const MAX_BACKOFF_MS = 15 * 60_000;

export type PendingViewedAck = {
  nixId: string;
  mediaPath: string;
  createdAt: number;
  attemptCount: number;
  nextAttemptAt: number;
};

let storageLock: Promise<void> = Promise.resolve();
const inFlightFlushes = new Map<string, Promise<number>>();

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

export async function clearPendingViewedAcks(userId: string) {
  await AsyncStorage.removeItem(storageKey(userId));
}

export function viewedAckRetryDelayMs(attemptCount: number) {
  if (attemptCount <= 1) return 60_000;
  if (attemptCount === 2) return 5 * 60_000;
  return MAX_BACKOFF_MS;
}

export function sanitizePendingViewedAcks(value: unknown): PendingViewedAck[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, PendingViewedAck>();
  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    const item = candidate as Partial<PendingViewedAck>;
    if (typeof item.nixId !== 'string' || typeof item.mediaPath !== 'string') return;
    if (!item.nixId || !item.mediaPath) return;
    byId.set(item.nixId, {
      nixId: item.nixId,
      mediaPath: item.mediaPath,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      attemptCount: typeof item.attemptCount === 'number' ? Math.max(0, item.attemptCount) : 0,
      nextAttemptAt: typeof item.nextAttemptAt === 'number' ? item.nextAttemptAt : 0,
    });
  });
  return [...byId.values()];
}

async function readQueue(userId: string): Promise<PendingViewedAck[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? sanitizePendingViewedAcks(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

async function writeQueue(userId: string, queue: PendingViewedAck[]) {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(storageKey(userId));
    return;
  }
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(queue));
}

function mutateQueue(
  userId: string,
  mutation: (queue: PendingViewedAck[]) => PendingViewedAck[]
): Promise<void> {
  const operation = storageLock.then(async () => {
    const queue = await readQueue(userId);
    await writeQueue(userId, mutation(queue));
  });
  storageLock = operation.catch(() => {});
  return operation;
}

export function enqueueViewedAck(userId: string, ack: PendingViewedAck) {
  return mutateQueue(userId, (queue) => {
    const existing = queue.find((item) => item.nixId === ack.nixId);
    if (existing) return queue;
    return [...queue, ack];
  });
}

function removeViewedAck(userId: string, nixId: string) {
  return mutateQueue(userId, (queue) => queue.filter((item) => item.nixId !== nixId));
}

function postponeViewedAck(userId: string, nixId: string, now: number) {
  return mutateQueue(userId, (queue) =>
    queue.map((item) => {
      if (item.nixId !== nixId) return item;
      const attemptCount = item.attemptCount + 1;
      return {
        ...item,
        attemptCount,
        nextAttemptAt: now + viewedAckRetryDelayMs(attemptCount),
      };
    })
  );
}

async function deliverViewedAck(userId: string, ack: PendingViewedAck) {
  try {
    await markNixViewedWithCleanup(ack.nixId, ack.mediaPath);
    await removeViewedAck(userId, ack.nixId);
    trackEvent('viewed_ack_delivered', { attempt_count: ack.attemptCount });
    return true;
  } catch (error) {
    await postponeViewedAck(userId, ack.nixId, Date.now());
    trackEvent('viewed_ack_deferred', {
      attempt_count: ack.attemptCount + 1,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

function deliverViewedAcksSerially(userId: string, acknowledgements: PendingViewedAck[]) {
  return acknowledgements.reduce<Promise<number>>(
    (deliveredPromise, acknowledgement) =>
      deliveredPromise.then((delivered) =>
        deliverViewedAck(userId, acknowledgement).then(
          (wasDelivered) => delivered + (wasDelivered ? 1 : 0)
        )
      ),
    Promise.resolve(0)
  );
}

export async function acknowledgeViewedNix(item: { id: string; media_path: string }) {
  const user = await getCurrentUser();
  if (!user) return false;
  const ack: PendingViewedAck = {
    nixId: item.id,
    mediaPath: item.media_path,
    createdAt: Date.now(),
    attemptCount: 0,
    nextAttemptAt: 0,
  };

  try {
    await enqueueViewedAck(user.id, ack);
  } catch (error) {
    console.warn('Nie udało się zapisać potwierdzenia odczytu', error);
  }
  return deliverViewedAck(user.id, ack);
}

export function flushPendingViewedAcks(userId: string, options?: { force?: boolean }) {
  const existing = inFlightFlushes.get(userId);
  if (existing) return existing;

  const flush = (async () => {
    const now = Date.now();
    const queue = await readQueue(userId);
    const due = queue.filter((ack) => options?.force || ack.nextAttemptAt <= now);
    return deliverViewedAcksSerially(userId, due);
  })().finally(() => {
    inFlightFlushes.delete(userId);
  });

  inFlightFlushes.set(userId, flush);
  return flush;
}
