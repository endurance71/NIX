import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyDomainError, notifyError, notifyInfo, notifyShow, notifySuccess, notifyWarning } from './appNotify';
import { appNotificationQueue as queue } from './notificationQueue';
import { installNotificationFeedback, presentAppNotification } from './notificationFeedback';
import { DomainError } from '../services/errors';

const { mockHapticNotify } = vi.hoisted(() => ({ mockHapticNotify: vi.fn() }));
vi.mock('./haptics', () => ({ notify: mockHapticNotify }));
vi.mock('./i18n', () => ({ default: {
  t: (key: string, opts?: { defaultValue?: string; amount?: number }) =>
    opts?.amount ? `${key}: ${opts.amount}` : opts?.defaultValue ?? key,
} }));


let uninstallFeedback = () => {};
const mockAnnounce = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); queue.clear(); queue.setScreenReader(false); queue.setActive(true);
  uninstallFeedback = installNotificationFeedback(mockAnnounce);
});
afterEach(() => { uninstallFeedback(); queue.setActive(false); vi.useRealTimers(); });
const token = () => ({ id: queue.getSnapshot().notification!.id, generation: queue.getSnapshot().generation });

describe('appNotify migration and presentation', () => {
  it.each([
    [notifySuccess, 'success'], [notifyError, 'error'], [notifyWarning, 'warning'], [notifyInfo, 'info'],
  ] as const)('routes helper to the new queue with kind %s', (notify, kind) => {
    const id = notify(' OK ', { message: ' Details ', duration: 1000 });
    expect(queue.getSnapshot().notification).toMatchObject({ id, title: 'OK', message: 'Details', kind, duration: 1000 });
  });
  it.each(['success', 'error', 'warning'] as const)('plays %s haptics once, at enqueue (the cause), not at reveal', (kind) => {
    notifyShow({ title: 'Result', kind });
    expect(mockHapticNotify).toHaveBeenCalledExactlyOnceWith(kind);
    const current = token(); const announce = vi.fn();
    presentAppNotification(current, announce); presentAppNotification(current, announce);
    expect(mockHapticNotify).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledExactlyOnceWith('Result');
  });
  it('plays haptics for a card that waits behind another one at enqueue time, and not again on reveal', () => {
    notifyInfo('First'); notifyWarning('Second');
    expect(mockHapticNotify).toHaveBeenCalledExactlyOnceWith('warning');
    expect(queue.getSnapshot().notification?.title).toBe('First');
  });
  it('stops feedback after the provider uninstalls it', () => {
    uninstallFeedback(); notifyError('Failed'); expect(mockHapticNotify).not.toHaveBeenCalled();
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
  it('keeps the failed action as title and the translated domain reason as detail', () => {
    notifyDomainError(new DomainError('RATE_LIMITED', 'Fallback', { amount: 3 }), 'Other fallback');
    expect(queue.getSnapshot().notification).toMatchObject({
      title: 'Other fallback', message: 'domainErrors.RATE_LIMITED: 3', kind: 'error',
    });
  });
  it('never shows raw error messages for unknown errors', () => {
    notifyDomainError(new Error('duplicate key value violates unique constraint'), 'Fallback');
    expect(queue.getSnapshot().notification).toMatchObject({ title: 'Fallback', message: 'notify.tryAgainHint', kind: 'error' });
    queue.clear();
    notifyDomainError(null, 'Fallback'); expect(queue.getSnapshot().notification?.title).toBe('Fallback');
  });
  it.each([
    new TypeError('Network request failed'),
    Object.assign(new Error('TypeError: Network request failed'), { name: 'PostgrestError' }),
    Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' }),
  ])('reports transport failures as a connection warning (%s)', (error) => {
    notifyDomainError(error, 'Fallback');
    expect(queue.getSnapshot().notification).toMatchObject({ title: 'Fallback', message: 'notify.networkHint', kind: 'warning' });
  });
  it('never emits feedback for a discarded old generation', () => {
    notifySuccess('Old'); const old = token(); queue.clear(); notifySuccess('New');
    mockHapticNotify.mockClear();
    expect(presentAppNotification(old)).toBe(false); expect(mockHapticNotify).not.toHaveBeenCalled();
    expect(queue.getSnapshot().phase).toBe('entering');
  });
});
