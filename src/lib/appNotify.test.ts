import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToast, mockHapticNotify } = vi.hoisted(() => ({
  mockToast: {
    success: vi.fn(() => 'id-success'),
    error: vi.fn(() => 'id-error'),
    warning: vi.fn(() => 'id-warning'),
    info: vi.fn(() => 'id-info'),
    show: vi.fn(() => 'id-show'),
  },
  mockHapticNotify: vi.fn(),
}));

vi.mock('react-native-pretty-toast', () => ({
  toast: mockToast,
}));

vi.mock('./haptics', () => ({
  notify: (...args: unknown[]) => mockHapticNotify(...args),
}));

vi.mock('./i18n', () => ({
  default: {
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  },
}));

import {
  notifyDomainError,
  notifyError,
  notifyInfo,
  notifyShow,
  notifySuccess,
  notifyWarning,
} from './appNotify';

describe('appNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPO_OS = 'ios';
  });

  it('notifySuccess wywołuje haptykę success i toast.success', () => {
    const id = notifySuccess('OK');
    expect(mockHapticNotify).toHaveBeenCalledTimes(1);
    expect(mockHapticNotify).toHaveBeenCalledWith('success');
    expect(mockToast.success).toHaveBeenCalledWith('OK', { message: ' ' }, undefined);
    expect(id).toBe('id-success');
  });

  it('notifyError wywołuje haptykę error i toast.error', () => {
    const id = notifyError('Błąd');
    expect(mockHapticNotify).toHaveBeenCalledTimes(1);
    expect(mockHapticNotify).toHaveBeenCalledWith('error');
    expect(mockToast.error).toHaveBeenCalled();
    expect(id).toBe('id-error');
  });

  it('notifyWarning wywołuje haptykę warning', () => {
    notifyWarning('Uwaga');
    expect(mockHapticNotify).toHaveBeenCalledWith('warning');
    expect(mockToast.warning).toHaveBeenCalledWith('Uwaga', { message: ' ' }, undefined);
  });

  it('notifyInfo nie wywołuje haptyki', () => {
    notifyInfo('Info');
    expect(mockHapticNotify).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith('Info', { message: ' ' }, undefined);
  });

  it('notifyShow nie wywołuje haptyki', () => {
    notifyShow({ title: 'X', message: 'msg' });
    expect(mockHapticNotify).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalled();
  });

  it('notifyDomainError wywołuje haptykę error z przetłumaczonym komunikatem', () => {
    notifyDomainError(new Error('sieć padła'), 'fallback');
    expect(mockHapticNotify).toHaveBeenCalledTimes(1);
    expect(mockHapticNotify).toHaveBeenCalledWith('error');
    expect(mockToast.error).toHaveBeenCalledWith(
      'sieć padła',
      expect.objectContaining({ duration: expect.any(Number) }),
      undefined
    );
  });
});
