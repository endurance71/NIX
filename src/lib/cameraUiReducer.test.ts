import { describe, expect, it } from 'vitest';
import { cameraUiReducer, initialCameraUiState } from './cameraUiReducer';

describe('cameraUiReducer', () => {
  it('VIDEO_PREPARE_BEGIN prepares video mode without marking recording active', () => {
    const state = cameraUiReducer(
      { ...initialCameraUiState, cameraReady: true, flash: 'on' },
      { type: 'VIDEO_PREPARE_BEGIN' }
    );

    expect(state.videoPreparing).toBe(true);
    expect(state.recordingVideo).toBe(false);
    expect(state.recordingElapsedSec).toBe(0);
    expect(state.cameraReady).toBe(false);
    expect(state.captureMode).toBe('video');
    expect(state.flash).toBe('on');
  });

  it('VIDEO_RECORDING_BEGIN moves from preparing to active recording', () => {
    const preparing = cameraUiReducer(initialCameraUiState, { type: 'VIDEO_PREPARE_BEGIN' });
    const state = cameraUiReducer(preparing, { type: 'VIDEO_RECORDING_BEGIN' });

    expect(state.videoPreparing).toBe(false);
    expect(state.recordingVideo).toBe(true);
    expect(state.recordingElapsedSec).toBe(0);
    expect(state.captureMode).toBe('video');
  });

  it('VIDEO_SESSION_END clears preparation, recording, timer, and returns to picture mode', () => {
    const recording = cameraUiReducer(
      cameraUiReducer(initialCameraUiState, { type: 'VIDEO_PREPARE_BEGIN' }),
      { type: 'VIDEO_RECORDING_BEGIN' }
    );
    const elapsed = cameraUiReducer(recording, { type: 'SET_RECORDING_ELAPSED_SEC', recordingElapsedSec: 12 });
    const state = cameraUiReducer(elapsed, { type: 'VIDEO_SESSION_END' });

    expect(state.videoPreparing).toBe(false);
    expect(state.recordingVideo).toBe(false);
    expect(state.recordingElapsedSec).toBe(0);
    expect(state.cameraReady).toBe(false);
    expect(state.captureMode).toBe('picture');
  });

  it('SET_CAPTURE_MODE invalidates camera readiness when switching modes', () => {
    const state = cameraUiReducer(
      { ...initialCameraUiState, cameraReady: true },
      { type: 'SET_CAPTURE_MODE', captureMode: 'video' }
    );

    expect(state.cameraReady).toBe(false);
    expect(state.captureMode).toBe('video');
  });
});
