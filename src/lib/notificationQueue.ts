export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export type AppNotificationConfig = {
  title: string;
  message?: string;
  kind?: NotificationKind;
  duration?: number | null;
  id?: string;
  onPress?: () => void;
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
};

/** UI callbacks and timers must carry this token, including after a reset. */
export type NotificationToken = { id: string; generation: number };

const DEDUPLICATION_MS = 2000;
const MAX_PENDING = 2;

export class NotificationQueue {
  private snapshot: NotificationSnapshot = { notification: null, phase: 'idle', generation: 0 };
  private pending: AppNotification[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  private active = false;
  private screenReader = false;
  private owner: string | null = null;

  getSnapshot = (): NotificationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(notification: AppNotification | null, phase: NotificationPhase, generation = this.snapshot.generation) {
    this.snapshot = { notification, phase, generation };
    this.listeners.forEach((listener) => listener());
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
    const candidates = [this.snapshot.notification, ...this.pending];
    const duplicate = candidates.find((item) => item && (
      item.id === id || (createdAt - item.createdAt <= DEDUPLICATION_MS &&
        item.kind === kind && item.title === title && item.message === message)
    ));
    if (duplicate) return duplicate.id;

    const notification: AppNotification = { ...config, id, title, message, kind, createdAt };
    if (!this.snapshot.notification) {
      this.enter(notification);
    } else {
      this.pending = [...this.pending.slice(-(MAX_PENDING - 1)), notification];
    }
    return id;
  };

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
    if (!item || this.screenReader || item.duration === null) return;
    const fallback = item.kind === 'error' ? 5000 : 4000;
    const lifetime = item.duration === undefined || !Number.isFinite(item.duration)
      ? fallback : Math.max(0, item.duration);
    this.timer = setTimeout(() => this.dismiss(token), lifetime);
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

  setScreenReader = (enabled: boolean) => {
    if (this.screenReader === enabled) return;
    this.screenReader = enabled;
    this.clearTimer();
    const item = this.snapshot.notification;
    if (!enabled && item && this.snapshot.phase === 'visible') {
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
