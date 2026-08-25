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
    expect(state.videoTorchRequested).toBe(true);
  });

  it('VIDEO_PREPARE_BEGIN can preserve camera readiness when native view is not remounted', () => {
    const state = cameraUiReducer(
      { ...initialCameraUiState, cameraReady: true, flash: 'on' },
      { type: 'VIDEO_PREPARE_BEGIN', resetCameraReady: false }
    );

    expect(state.cameraReady).toBe(true);
    expect(state.captureMode).toBe('video');
    expect(state.videoTorchRequested).toBe(true);
  });

  it('VIDEO_PREPARE_BEGIN does not request torch when flash is off or camera is front-facing', () => {
    const flashOff = cameraUiReducer(initialCameraUiState, { type: 'VIDEO_PREPARE_BEGIN' });
    const frontCamera = cameraUiReducer(
      { ...initialCameraUiState, facing: 'front', flash: 'on' },
      { type: 'VIDEO_PREPARE_BEGIN' }
    );

    expect(flashOff.videoTorchRequested).toBe(false);
    expect(frontCamera.videoTorchRequested).toBe(false);
  });

  it('VIDEO_RECORDING_BEGIN moves from preparing to active recording', () => {
    const preparing = cameraUiReducer(
      { ...initialCameraUiState, flash: 'on' },
      { type: 'VIDEO_PREPARE_BEGIN' }
    );
    const state = cameraUiReducer(preparing, { type: 'VIDEO_RECORDING_BEGIN' });

    expect(state.videoPreparing).toBe(false);
    expect(state.recordingVideo).toBe(true);
    expect(state.recordingElapsedSec).toBe(0);
    expect(state.captureMode).toBe('video');
    expect(state.stillFlashArmed).toBe(false);
    expect(state.videoTorchRequested).toBe(true);
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

  it('VIDEO_SESSION_END can preserve camera readiness when native view is not remounted', () => {
    const recording = cameraUiReducer(
      cameraUiReducer({ ...initialCameraUiState, cameraReady: true }, { type: 'VIDEO_PREPARE_BEGIN', resetCameraReady: false }),
      { type: 'VIDEO_RECORDING_BEGIN' }
    );
    const state = cameraUiReducer(recording, { type: 'VIDEO_SESSION_END', resetCameraReady: false });

    expect(state.cameraReady).toBe(true);
    expect(state.captureMode).toBe('picture');
    expect(state.recordingVideo).toBe(false);
  });

  it('preserves the selected lens and zoom through the whole recording session', () => {
    const selected = {
      ...initialCameraUiState,
      cameraReady: true,
      zoom: 0.25,
      selectedLens: 'Back Telephoto Camera',
      lensOptionId: '2x',
    };
    const preparing = cameraUiReducer(selected, {
      type: 'VIDEO_PREPARE_BEGIN',
      resetCameraReady: false,
    });
    const recording = cameraUiReducer(preparing, { type: 'VIDEO_RECORDING_BEGIN' });
    const ended = cameraUiReducer(recording, {
      type: 'VIDEO_SESSION_END',
      resetCameraReady: false,
    });

    for (const state of [preparing, recording, ended]) {
      expect(state.zoom).toBe(0.25);
      expect(state.selectedLens).toBe('Back Telephoto Camera');
      expect(state.lensOptionId).toBe('2x');
    }
  });

  it('CLEAR_VIDEO_TORCH clears pending video torch request', () => {
    const requested = cameraUiReducer(
      { ...initialCameraUiState, flash: 'on' },
      { type: 'VIDEO_PREPARE_BEGIN' }
    );
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

  it('SET_CAPTURE_MODE can preserve camera readiness when native view is not remounted', () => {
    const state = cameraUiReducer(
      { ...initialCameraUiState, cameraReady: true },
      { type: 'SET_CAPTURE_MODE', captureMode: 'video', resetCameraReady: false }
    );

    expect(state.cameraReady).toBe(true);
    expect(state.captureMode).toBe('video');
  });

  it('SET_LENS_PRESET sets lens chip, selectedLens, and zoom (incl. 2× crop)', () => {
    const state = cameraUiReducer(
      { ...initialCameraUiState, zoom: 0.1 },
      {
        type: 'SET_LENS_PRESET',
        selectedLens: 'Back Camera',
        lensOptionId: '2x',
        zoom: 0.25,
      }
    );

    expect(state.selectedLens).toBe('Back Camera');
    expect(state.lensOptionId).toBe('2x');
    expect(state.zoom).toBe(0.25);
  });

  it('SET_LENS_PRESET is a no-op when preset is unchanged', () => {
    const prev = {
      ...initialCameraUiState,
      selectedLens: 'Back Camera',
      lensOptionId: '1x',
      zoom: 0,
    };
    const state = cameraUiReducer(prev, {
      type: 'SET_LENS_PRESET',
      selectedLens: 'Back Camera',
      lensOptionId: '1x',
      zoom: 0,
    });

    expect(state).toBe(prev);
  });

  it('START_CAMERA_SWITCH clears selectedLens, lensOptionId, and zoom', () => {
    const state = cameraUiReducer(
      {
        ...initialCameraUiState,
        facing: 'back',
        zoom: 0.3,
        selectedLens: 'Back Telephoto Camera',
        lensOptionId: 'tele',
      },
      { type: 'START_CAMERA_SWITCH', nextFacing: 'front' }
    );

    expect(state.facing).toBe('front');
    expect(state.selectedLens).toBeNull();
    expect(state.lensOptionId).toBeNull();
    expect(state.zoom).toBe(0);
    expect(state.isSwitchingCamera).toBe(true);
  });
});
