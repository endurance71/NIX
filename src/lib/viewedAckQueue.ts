import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '../services/profileService';
import { markNixViewedForReplay, markNixReplayedWithCleanup } from '../services/nixService';
import { trackEvent } from './telemetry';
import { captureAccountTransport, type AccountTransport } from './supabase';
import { SessionScopeCancelledError } from './sessionScope';

const STORAGE_PREFIX = 'nix.viewed_ack_queue.v1';
const MAX_BACKOFF_MS = 15 * 60_000;

export type PendingViewedAck = {
  nixId: string;
  mediaPath: string;
  ackType: 'viewed' | 'replayed';
  createdAt: number;
  attemptCount: number;
  nextAttemptAt: number;
};

let storageLock: Promise<void> = Promise.resolve();
const inFlightFlushes = new Map<string, Promise<number>>();
const versions = new Map<string, number>();

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

export function clearPendingViewedAcks(userId: string) {
  versions.set(userId, (versions.get(userId) ?? 0) + 1);
  const operation = storageLock.then(() => AsyncStorage.removeItem(storageKey(userId)));
  storageLock = operation.catch(() => {});
  return operation;
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
      ackType: item.ackType === 'replayed' ? 'replayed' : 'viewed',
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
  const version = versions.get(userId) ?? 0;
  const operation = storageLock.then(async () => {
    const queue = await readQueue(userId);
    if ((versions.get(userId) ?? 0) !== version) throw new SessionScopeCancelledError();
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

async function deliverViewedAck(userId: string, ack: PendingViewedAck, transport: AccountTransport) {
  try {
    transport.assertActive();
    if (ack.ackType === 'viewed') {
      await markNixViewedForReplay(ack.nixId, transport);
    } else {
      await markNixReplayedWithCleanup(ack.nixId, undefined, transport);
    }
    transport.assertActive();
    await removeViewedAck(userId, ack.nixId);
    trackEvent('viewed_ack_delivered', { attempt_count: ack.attemptCount, ack_type: ack.ackType });
    return true;
  } catch (error) {
    transport.assertActive();
    await postponeViewedAck(userId, ack.nixId, Date.now());
    trackEvent('viewed_ack_deferred', {
      attempt_count: ack.attemptCount + 1,
      error_message: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

function deliverViewedAcksSerially(userId: string, acknowledgements: PendingViewedAck[], transport: AccountTransport) {
  return acknowledgements.reduce<Promise<number>>(
    (deliveredPromise, acknowledgement) =>
      deliveredPromise.then((delivered) =>
        deliverViewedAck(userId, acknowledgement, transport).then(
          (wasDelivered) => delivered + (wasDelivered ? 1 : 0)
        )
      ),
    Promise.resolve(0)
  );
}

export async function acknowledgeViewedNix(item: { id: string; media_path: string }, ackType: 'viewed' | 'replayed' = 'viewed') {
  const user = await getCurrentUser();
  if (!user) return false;
  const transport = await captureAccountTransport(user.id);
  const ack: PendingViewedAck = {
    nixId: item.id,
    mediaPath: item.media_path,
    ackType,
    createdAt: Date.now(),
    attemptCount: 0,
    nextAttemptAt: 0,
  };

  try {
    await enqueueViewedAck(user.id, ack);
  } catch (error) {
    console.warn('Nie udało się zapisać potwierdzenia odczytu', error);
  }
  transport.assertActive();
  return deliverViewedAck(user.id, ack, transport).catch(() => false);
}

export function flushPendingViewedAcks(userId: string, options?: { force?: boolean }) {
  const existing = inFlightFlushes.get(userId);
  if (existing) return existing;

  const flush = (async () => {
    const transport = await captureAccountTransport(userId);
    const now = Date.now();
    const queue = await readQueue(userId);
    transport.assertActive();
    const due = queue.filter((ack) => options?.force || ack.nextAttemptAt <= now);
    return deliverViewedAcksSerially(userId, due, transport);
  })().finally(() => {
    inFlightFlushes.delete(userId);
  });

  inFlightFlushes.set(userId, flush);
  return flush;
}
