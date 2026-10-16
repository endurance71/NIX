import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedValue } from 'react-native-reanimated';
import { appNotificationQueue as queue, type NotificationToken } from '../../lib/notificationQueue';
import { useNotificationGesture } from './useNotificationGesture';

const capture = vi.hoisted(() => {
  type MotionEvent = { velocityY: number; changeY: number; canceled: boolean };
  type Callback = (event: MotionEvent) => void;
  type Config = { onUpdate?: Callback; onDeactivate?: Callback; onFinalize?: Callback };
  const makeGesture = () => {
    const callbacks: { update?: Callback; deactivate?: Callback; finalize?: Callback } = {};
    const hook = (config: Config) => {
      callbacks.update = config.onUpdate;
      callbacks.deactivate = config.onDeactivate;
      callbacks.finalize = config.onFinalize;
      return config;
    };
    return { callbacks, hook };
  };
  return {
    pan: makeGesture(), tap: makeGesture(),
    spring: vi.fn((target: number) => target),
    schedule: vi.fn((callback: () => void) => callback()),
  };
});

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
}));
vi.mock('react-native-gesture-handler', () => ({
  usePanGesture: capture.pan.hook,
  useTapGesture: capture.tap.hook,
  useExclusiveGestures: (...gestures: unknown[]) => gestures,
}));
vi.mock('react-native-reanimated', () => ({ withSpring: capture.spring }));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: capture.schedule }));

function sharedOffset(initial = 0): SharedValue<number> {
  let offset = initial;
  return {
    get: () => offset,
    set: (next: number | ((value: number) => number)) => {
      offset = typeof next === 'function' ? next(offset) : next;
    },
  } as SharedValue<number>;
}

function currentToken(): NotificationToken {
  return { id: queue.getSnapshot().notification!.id, generation: queue.getSnapshot().generation };
}

function show(onPress = vi.fn()) {
  queue.enqueue({ title: 'Ready', duration: null, onPress });
  const token = currentToken();
  queue.markPresented(token);
  const offset = sharedOffset();
  // React hooks are mocked above: this test exercises captured native callbacks, not a component render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useNotificationGesture(token, offset, true);
  return { offset, onPress, token };
}

beforeEach(() => {
  vi.clearAllMocks();
  queue.clear();
  queue.setScreenReader(false);
  queue.setActive(true);
});
afterEach(() => { queue.setActive(false); });

describe('notification gesture lifecycle', () => {
  it('resets a cancelled active pan without dismissing or invoking its action', () => {
    const { offset, onPress } = show();
    capture.pan.callbacks.update!({ changeY: -60, velocityY: -800, canceled: false });
    expect(offset.get()).toBe(-60);
    // RNGH 3 sends both callbacks with `canceled: true` when an ACTIVE pan is cancelled.
    capture.pan.callbacks.deactivate!({ changeY: 0, velocityY: -800, canceled: true });
    capture.pan.callbacks.finalize!({ changeY: 0, velocityY: -800, canceled: true });
    expect(queue.getSnapshot().phase).toBe('visible');
    expect(offset.get()).toBe(0);
    expect(onPress).not.toHaveBeenCalled();
    expect(capture.schedule).not.toHaveBeenCalled();
  });

  it('dismisses a completed upward swipe without invoking the tap action', () => {
    const { onPress } = show();
    capture.pan.callbacks.update!({ changeY: -40, velocityY: 0, canceled: false });
    capture.pan.callbacks.deactivate!({ changeY: 0, velocityY: 0, canceled: false });
    capture.pan.callbacks.finalize!({ changeY: 0, velocityY: 0, canceled: false });
    expect(queue.getSnapshot().phase).toBe('exiting');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('returns a short drag to its original position and keeps the notification visible', () => {
    const { offset } = show();
    capture.pan.callbacks.update!({ changeY: -16, velocityY: 0, canceled: false });
    capture.pan.callbacks.deactivate!({ changeY: 0, velocityY: -50, canceled: false });
    capture.pan.callbacks.finalize!({ changeY: 0, velocityY: -50, canceled: false });
    expect(offset.get()).toBe(0);
    expect(queue.getSnapshot().phase).toBe('visible');
    expect(capture.schedule).not.toHaveBeenCalled();
  });

  it('ignores a delayed tap from before a reset, even when the notification ID is reused', () => {
    const oldAction = vi.fn();
    queue.enqueue({ title: 'Old account', id: 'same', duration: null, onPress: oldAction });
    useNotificationGesture(currentToken(), sharedOffset(), true);
    const oldTap = capture.tap.callbacks.deactivate!;
    queue.clear();
    const newAction = vi.fn();
    queue.enqueue({ title: 'New account', id: 'same', duration: null, onPress: newAction });
    queue.markPresented(currentToken());
    oldTap({ changeY: 0, velocityY: 0, canceled: false });
    expect(queue.getSnapshot().notification?.title).toBe('New account');
    expect(queue.getSnapshot().phase).toBe('visible');
    expect(oldAction).not.toHaveBeenCalled();
    expect(newAction).not.toHaveBeenCalled();
  });

  it('invokes the action once for a successful tap and ignores unsuccessful or repeated taps', () => {
    const { onPress } = show();
    capture.tap.callbacks.deactivate!({ changeY: 0, velocityY: 0, canceled: true });
    expect(queue.getSnapshot().phase).toBe('visible');
    capture.tap.callbacks.deactivate!({ changeY: 0, velocityY: 0, canceled: false });
    capture.tap.callbacks.deactivate!({ changeY: 0, velocityY: 0, canceled: false });
    expect(queue.getSnapshot().phase).toBe('exiting');
    expect(onPress).toHaveBeenCalledOnce();
  });
});
