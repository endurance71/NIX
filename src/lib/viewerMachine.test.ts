import { describe, expect, it } from 'vitest';
import { initialViewerMachineState, viewerMachineReducer } from './viewerMachine';

describe('viewerMachineReducer', () => {
  it('moves through boot, load, ready and close', () => {
    const loading = viewerMachineReducer(initialViewerMachineState, { type: 'load' });
    expect(loading.status).toBe('loadingMedia');

    const ready = viewerMachineReducer(loading, { type: 'ready' });
    expect(ready.status).toBe('ready');

    const closing = viewerMachineReducer(ready, { type: 'close' });
    expect(closing.status).toBe('closing');
    expect(viewerMachineReducer(closing, { type: 'ready' })).toBe(closing);
  });

  it('separates transient errors from confirmed missing media', () => {
    const transient = viewerMachineReducer(initialViewerMachineState, {
      type: 'fail',
      error: { kind: 'transient', message: 'offline', reason: 'network' },
    });
    expect(transient.status).toBe('transientError');

    const missing = viewerMachineReducer(transient, {
      type: 'fail',
      error: { kind: 'permanentMissing', message: 'missing', reason: 'storage_404' },
    });
    expect(missing.status).toBe('permanentMissing');
    expect(missing.error?.reason).toBe('storage_404');
  });

  it('allows retry after an error without closing the viewer', () => {
    const failed = viewerMachineReducer(initialViewerMachineState, {
      type: 'fail',
      error: { kind: 'transient', message: 'timeout', reason: 'signed_url' },
    });
    expect(viewerMachineReducer(failed, { type: 'load' })).toEqual({
      status: 'loadingMedia',
      error: null,
    });
  });
});
