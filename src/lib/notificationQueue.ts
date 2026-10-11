export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export type AppNotificationConfig = {
  title: string;
  message?: string;
  kind?: NotificationKind;
  duration?: number | null;
  /** Stable key: enqueueing the same `id` again updates the card in place and restarts its lifetime. */
  id?: string;
  onPress?: () => void;
  /**
   * Rare, prominent result: the card grows out of the Dynamic Island (Skia morph, ~1.3 s) when the
   * layout allows it. Everything else uses the fast card (≤ 300 ms in, ≤ 220 ms out).
   */
  prominent?: boolean;
};

export type AppNotification = AppNotificationConfig & {
  id: string;
  kind: NotificationKind;
  createdAt: number;
};

type NotificationPhase = 'idle' | 'entering' | 'visible' | 'exiting';
export type NotificationSnapshot = {
  notification: AppNotification | null;
  phase: NotificationPhase;
  generation: number;
  /** The exit was forced by a more important item (an error): play the shortest exit. */
  interrupted: boolean;
};

/** UI callbacks and timers must carry this token, including after a reset. */
export type NotificationToken = { id: string; generation: number };

/** Side effects at the cause: haptics on enqueue (not at reveal), re-announcement on an in-place update. */
export type NotificationFeedback = {
  haptic?: Exclude<NotificationKind, 'info'>;
  announcement?: string;
};

const DEDUPLICATION_MS = 2000;
const MAX_PENDING = 2;
const SCREEN_READER_MIN_LIFETIME_MS = 10_000;
const KIND_PRIORITY: Record<NotificationKind, number> = { info: 0, success: 1, warning: 2, error: 3 };

/** On overflow drop the least important pending item (oldest first), so errors survive bursts. */
function boundPending(pending: AppNotification[]): AppNotification[] {
  const next = [...pending];
  while (next.length > MAX_PENDING) {
    let dropIndex = 0;
    for (let index = 1; index < next.length; index += 1) {
      if (KIND_PRIORITY[next[index].kind] < KIND_PRIORITY[next[dropIndex].kind]) dropIndex = index;
    }
    next.splice(dropIndex, 1);
  }
  return next;
}

/** Errors (and a pre-empted card) go right after pending errors; everything else is FIFO. */
function insertPending(pending: AppNotification[], item: AppNotification, front = item.kind === 'error'): AppNotification[] {
  if (!front) return boundPending([...pending, item]);
  let index = 0;
  while (index < pending.length && pending[index].kind === 'error') index += 1;
  return boundPending([...pending.slice(0, index), item, ...pending.slice(index)]);
}

function spokenText(item: AppNotification): string {
  return [item.title, item.message].filter(Boolean).join('. ');
}

export class NotificationQueue {
  private snapshot: NotificationSnapshot = { notification: null, phase: 'idle', generation: 0, interrupted: false };
  private pending: AppNotification[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  private active = false;
  private screenReader = false;
  private owner: string | null = null;
  private feedback: ((feedback: NotificationFeedback) => void) | null = null;

  getSnapshot = (): NotificationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Installed by the provider; haptics must never come from the reveal animation (~1 s late). */
  setFeedbackHandler = (handler: ((feedback: NotificationFeedback) => void) | null) => {
    this.feedback = handler;
  };

  private emit(notification: AppNotification | null, phase: NotificationPhase,
    generation = this.snapshot.generation, interrupted = false) {
    this.snapshot = { notification, phase, generation, interrupted };
    this.listeners.forEach((listener) => listener());
  }

  private emitFeedback(feedback: NotificationFeedback) {
    if (feedback.haptic || feedback.announcement) this.feedback?.(feedback);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private matches(token: NotificationToken): boolean {
    return token.id === this.snapshot.notification?.id && token.generation === this.snapshot.generation;
  }

  private enter(notification: AppNotification) {
    this.emit(notification, 'entering', this.snapshot.generation + 1);
  }

  enqueue = (config: AppNotificationConfig): string => {
    const id = config.id ?? `notification-${++this.sequence}`;
    const title = config.title.trim();
    const message = config.message?.trim() || undefined;
    if (!this.active || !title) return id;
    const kind = config.kind ?? 'info';
    const createdAt = Date.now();
    const notification: AppNotification = { ...config, id, title, message, kind, createdAt };
    const current = this.snapshot.notification;

    // Keyed update: same `id` replaces content instead of being ignored or queued twice.
    if (config.id !== undefined) {
      if (current?.id === id && this.snapshot.phase !== 'exiting') {
        this.replaceCurrent(current, notification);
        return id;
      }
      const pendingIndex = this.pending.findIndex((item) => item.id === id);
      if (pendingIndex >= 0) {
        const previous = this.pending[pendingIndex];
        this.pending = this.pending.map((item, index) => index === pendingIndex ? notification : item);
        this.emitFeedback({ haptic: kind !== previous.kind && kind !== 'info' ? kind : undefined });
        return id;
      }
    }

    // Unkeyed repeats within two seconds merge without restarting the visible lifetime. (A keyed
    // item reaching this point has the same id only as the exiting card: it queues behind it.)
    const duplicate = [current, ...this.pending].find((item) => item && item.id !== id &&
      createdAt - item.createdAt <= DEDUPLICATION_MS &&
      item.kind === kind && item.title === title && item.message === message);
    if (duplicate) return duplicate.id;

    this.emitFeedback({ haptic: kind !== 'info' ? kind : undefined });
    if (!current) {
      this.enter(notification);
      return id;
    }
    this.pending = insertPending(this.pending, notification);
    // An error pre-empts a visible success/info/warning: fast exit, then the error.
    if (kind === 'error' && current.kind !== 'error' && this.snapshot.phase !== 'exiting') {
      // A card that was still entering has not been read yet: show it again after the error.
      if (this.snapshot.phase === 'entering') {
        this.pending = insertPending(this.pending, current, true);
      }
      this.clearTimer();
      this.emit(current, 'exiting', this.snapshot.generation, true);
    }
    return id;
  };

  private replaceCurrent(current: AppNotification, next: AppNotification) {
    const { phase, generation } = this.snapshot;
    this.emit(next, phase, generation);
    if (phase === 'visible') this.armTimer({ id: next.id, generation });
    this.emitFeedback({
      haptic: next.kind !== current.kind && next.kind !== 'info' ? next.kind : undefined,
      // The reveal announcement already happened; VoiceOver users need the new content too.
      announcement: phase === 'visible' && this.screenReader && spokenText(next) !== spokenText(current)
        ? spokenText(next) : undefined,
    });
  }

  /** Called when content has finished revealing, not when enqueue is called. */
  markPresented = (token: NotificationToken): boolean => {
    if (!this.matches(token) || this.snapshot.phase !== 'entering') return false;
    this.emit(this.snapshot.notification, 'visible');
    this.armTimer(token);
    return true;
  };

  private armTimer(token: NotificationToken) {
    this.clearTimer();
    const item = this.snapshot.notification;
    if (!item || item.duration === null) return;
    const fallback = item.kind === 'error' ? 5000 : 4000;
    const lifetime = item.duration === undefined || !Number.isFinite(item.duration)
      ? fallback : Math.max(0, item.duration);
    // VoiceOver users get more time, but a finite one: a card that never leaves covers the
    // navigation bar (Back button) and blocks every queued message behind it.
    const effectiveLifetime = this.screenReader
      ? Math.max(SCREEN_READER_MIN_LIFETIME_MS, lifetime * 2)
      : lifetime;
    this.timer = setTimeout(() => this.dismiss(token), effectiveLifetime);
  }

  dismiss = (token: NotificationToken): boolean => {
    if (!this.matches(token) || this.snapshot.phase === 'exiting') return false;
    this.clearTimer();
    this.emit(this.snapshot.notification, 'exiting');
    return true;
  };

  finishDismiss = (token: NotificationToken): boolean => {
    if (!this.matches(token) || this.snapshot.phase !== 'exiting') return false;
    const next = this.pending.shift();
    if (next) this.enter(next);
    else this.emit(null, 'idle', this.snapshot.generation + 1);
    return true;
  };

  /**
   * Resolves once no card is mid-animation (idle or fully visible), or after `timeoutMs`.
   * Lets a system Alert wait instead of landing on top of an entering/exiting banner.
   */
  whenSettled = (timeoutMs = 1500): Promise<void> => new Promise((resolve) => {
    const settled = () => this.snapshot.phase === 'idle' || this.snapshot.phase === 'visible';
    if (settled()) {
      resolve();
      return;
    }
    let unsubscribe = () => {};
    const timer = setTimeout(() => { unsubscribe(); resolve(); }, timeoutMs);
    unsubscribe = this.subscribe(() => {
      if (!settled()) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });

  setScreenReader = (enabled: boolean) => {
    if (this.screenReader === enabled) return;
    this.screenReader = enabled;
    this.clearTimer();
    const item = this.snapshot.notification;
    if (item && this.snapshot.phase === 'visible') {
      this.armTimer({ id: item.id, generation: this.snapshot.generation });
    }
  };

  setOwner = (owner: string | null) => {
    if (this.owner === owner) return;
    this.owner = owner;
    this.clear();
  };

  setActive = (active: boolean) => {
    this.active = active;
    if (!active) this.clear();
  };

  clear = () => {
    this.clearTimer();
    this.pending = [];
    this.emit(null, 'idle', this.snapshot.generation + 1);
  };
}

export const appNotificationQueue = new NotificationQueue();
