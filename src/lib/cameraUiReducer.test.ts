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
    expect(state.stillFlashArmed).toBe(false);
  });

  it('VIDEO_RECORDING_BEGIN moves from preparing to active recording', () => {
    const preparing = cameraUiReducer(initialCameraUiState, { type: 'VIDEO_PREPARE_BEGIN' });
    const state = cameraUiReducer(preparing, { type: 'VIDEO_RECORDING_BEGIN' });

    expect(state.videoPreparing).toBe(false);
    expect(state.recordingVideo).toBe(true);
    expect(state.recordingElapsedSec).toBe(0);
    expect(state.captureMode).toBe('video');
    expect(state.stillFlashArmed).toBe(false);
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
    expect(state.stillFlashArmed).toBe(false);
    expect(state.videoTorchRequested).toBe(false);
  });

  it('REQUEST_VIDEO_TORCH requests video torch without arming still flash', () => {
    const state = cameraUiReducer(
      { ...initialCameraUiState, stillFlashArmed: true },
      { type: 'REQUEST_VIDEO_TORCH' }
    );

    expect(state.videoTorchRequested).toBe(true);
    expect(state.stillFlashArmed).toBe(false);
  });

  it('CLEAR_VIDEO_TORCH clears pending video torch request', () => {
    const requested = cameraUiReducer(initialCameraUiState, { type: 'REQUEST_VIDEO_TORCH' });
    const state = cameraUiReducer(requested, { type: 'CLEAR_VIDEO_TORCH' });

    expect(state.videoTorchRequested).toBe(false);
  });

  it('PREPARE_STILL_CAPTURE arms native flash only when the user flash preference is on', () => {
    const flashOn = cameraUiReducer(
      { ...initialCameraUiState, flash: 'on' },
      { type: 'PREPARE_STILL_CAPTURE' }
    );
    const flashOff = cameraUiReducer(initialCameraUiState, { type: 'PREPARE_STILL_CAPTURE' });

    expect(flashOn.takingPicture).toBe(true);
    expect(flashOn.stillFlashArmed).toBe(true);
    expect(flashOff.takingPicture).toBe(true);
    expect(flashOff.stillFlashArmed).toBe(false);
  });

  it('SET_TAKING_PICTURE false clears armed still flash', () => {
    const armed = cameraUiReducer(
      { ...initialCameraUiState, flash: 'on' },
      { type: 'PREPARE_STILL_CAPTURE' }
    );
    const state = cameraUiReducer(armed, { type: 'SET_TAKING_PICTURE', takingPicture: false });

    expect(state.takingPicture).toBe(false);
    expect(state.stillFlashArmed).toBe(false);
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
