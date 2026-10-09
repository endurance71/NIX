import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyDomainError, notifyError, notifyInfo, notifyShow, notifySuccess, notifyWarning } from './appNotify';
import { appNotificationQueue as queue } from './notificationQueue';
import { presentAppNotification } from './notificationFeedback';
import { DomainError } from '../services/errors';

const { mockHapticNotify } = vi.hoisted(() => ({ mockHapticNotify: vi.fn() }));
vi.mock('./haptics', () => ({ notify: mockHapticNotify }));
vi.mock('./i18n', () => ({ default: {
  t: (key: string, opts?: { defaultValue?: string; amount?: number }) =>
    opts?.amount ? `${key}: ${opts.amount}` : opts?.defaultValue ?? key,
} }));


beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); queue.clear(); queue.setScreenReader(false); queue.setActive(true); });
afterEach(() => { queue.setActive(false); vi.useRealTimers(); });
const token = () => ({ id: queue.getSnapshot().notification!.id, generation: queue.getSnapshot().generation });

describe('appNotify migration and presentation', () => {
  it.each([
    [notifySuccess, 'success'], [notifyError, 'error'], [notifyWarning, 'warning'], [notifyInfo, 'info'],
  ] as const)('routes helper to the new queue with kind %s', (notify, kind) => {
    const id = notify(' OK ', { message: ' Details ', duration: 1000 });
    expect(queue.getSnapshot().notification).toMatchObject({ id, title: 'OK', message: 'Details', kind, duration: 1000 });
    expect(mockHapticNotify).not.toHaveBeenCalled();
  });
  it.each(['success', 'error', 'warning'] as const)('plays %s feedback only once, at reveal completion', (kind) => {
    notifyShow({ title: 'Result', kind }); const current = token(); const announce = vi.fn();
    presentAppNotification(current, announce); presentAppNotification(current, announce);
    expect(mockHapticNotify).toHaveBeenCalledExactlyOnceWith(kind);
    expect(announce).toHaveBeenCalledExactlyOnceWith('Result');
  });
  it('does not play haptics for information and announces the complete description', () => {
    notifyInfo('Information', { message: 'Full description' }); const announce = vi.fn();
    presentAppNotification(token(), announce);
    expect(mockHapticNotify).not.toHaveBeenCalled(); expect(announce).toHaveBeenCalledWith('Information. Full description');
  });
  it('keeps the optional action and caller ID in notifyShow', () => {
    const onPress = vi.fn(); expect(notifyShow({ title: 'Result', id: 'action', onPress })).toBe('action');
    expect(queue.getSnapshot().notification?.onPress).toBe(onPress); expect(onPress).not.toHaveBeenCalled();
  });
  it('translates domain errors with interpolation parameters', () => {
    notifyDomainError(new DomainError('RATE_LIMITED', 'Fallback', { amount: 3 }), 'Other fallback');
    expect(queue.getSnapshot().notification).toMatchObject({ title: 'domainErrors.RATE_LIMITED: 3', kind: 'error' });
  });
  it('preserves the error message and falls back for unknown values', () => {
    notifyDomainError(new Error('Network failed'), 'Fallback');
    expect(queue.getSnapshot().notification?.title).toBe('Network failed'); queue.clear();
    notifyDomainError(null, 'Fallback'); expect(queue.getSnapshot().notification?.title).toBe('Fallback');
  });
  it('never emits feedback for a discarded old generation', () => {
    notifySuccess('Old'); const old = token(); queue.clear(); notifySuccess('New');
    expect(presentAppNotification(old)).toBe(false); expect(mockHapticNotify).not.toHaveBeenCalled();
    expect(queue.getSnapshot().phase).toBe('entering');
  });
});
