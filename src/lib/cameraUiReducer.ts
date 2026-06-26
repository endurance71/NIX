type CameraFacing = 'back' | 'front';
export type CameraCaptureMode = 'picture' | 'video';

export type CameraUiState = {
  facing: CameraFacing;
  flash: 'off' | 'on';
  recordAudioMuted: boolean;
  permissionLoadingTimedOut: boolean;
  takingPicture: boolean;
  captureError: string | null;
  videoPreparing: boolean;
  recordingVideo: boolean;
  recordingElapsedSec: number;
  cameraReady: boolean;
  cameraActive: boolean;
  zoom: number;
  isSwitchingCamera: boolean;
  cameraInstanceKey: number;
  /** Android: ImageCapture jest podpięty tylko w trybie picture; video wymaga osobnego use case. */
  captureMode: CameraCaptureMode;
};

export const initialCameraUiState: CameraUiState = {
  facing: 'back',
  flash: 'off',
  recordAudioMuted: false,
  permissionLoadingTimedOut: false,
  takingPicture: false,
  captureError: null,
  videoPreparing: false,
  recordingVideo: false,
  recordingElapsedSec: 0,
  cameraReady: false,
  cameraActive: true,
  zoom: 0,
  isSwitchingCamera: false,
  cameraInstanceKey: 0,
  captureMode: 'picture',
};

export type CameraUiAction =
  | { type: 'SET_CAMERA_ACTIVE'; cameraActive: boolean }
  | { type: 'SET_SWITCHING_CAMERA'; isSwitchingCamera: boolean }
  | { type: 'PERMISSION_LOADING_TIMED_OUT' }
  | { type: 'REMOUNT_CAMERA_PREVIEW' }
  | {
      type: 'ON_CAMERA_READY';
      clearSwitchingUi: boolean;
    }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'VIDEO_PREPARE_BEGIN' }
  | { type: 'VIDEO_RECORDING_BEGIN' }
  | { type: 'VIDEO_SESSION_END' }
  | { type: 'PREPARE_STILL_CAPTURE' }
  | { type: 'SET_CAPTURE_MODE'; captureMode: CameraCaptureMode }
  | { type: 'SET_CAPTURE_ERROR'; captureError: string | null }
  | { type: 'SET_TAKING_PICTURE'; takingPicture: boolean }
  | { type: 'SET_RECORDING_ELAPSED_SEC'; recordingElapsedSec: number }
  | { type: 'START_CAMERA_SWITCH'; nextFacing: CameraFacing }
  | { type: 'UPDATE_CAMERA_INSTANCE_KEY'; updater: (current: number) => number }
  | { type: 'TOGGLE_FLASH' }
  | { type: 'TOGGLE_RECORD_AUDIO_MUTED' };

export function cameraUiReducer(state: CameraUiState, action: CameraUiAction): CameraUiState {
  switch (action.type) {
    case 'SET_CAMERA_ACTIVE':
      return state.cameraActive === action.cameraActive ? state : { ...state, cameraActive: action.cameraActive };
    case 'SET_SWITCHING_CAMERA':
      return state.isSwitchingCamera === action.isSwitchingCamera
        ? state
        : { ...state, isSwitchingCamera: action.isSwitchingCamera };
    case 'PERMISSION_LOADING_TIMED_OUT':
      return state.permissionLoadingTimedOut ? state : { ...state, permissionLoadingTimedOut: true };
    case 'REMOUNT_CAMERA_PREVIEW':
      return state.cameraReady === false ? state : { ...state, cameraReady: false };
    case 'ON_CAMERA_READY': {
      const next = {
        ...state,
        cameraReady: true,
        ...(action.clearSwitchingUi ? { isSwitchingCamera: false } : {}),
      };
      return next.cameraReady === state.cameraReady && next.isSwitchingCamera === state.isSwitchingCamera
        ? state
        : next;
    }
    case 'SET_ZOOM':
      return state.zoom === action.zoom ? state : { ...state, zoom: action.zoom };
    case 'VIDEO_PREPARE_BEGIN':
      return {
        ...state,
        videoPreparing: true,
        recordingVideo: false,
        recordingElapsedSec: 0,
        captureError: null,
        cameraReady: false,
        captureMode: 'video',
      };
    case 'VIDEO_RECORDING_BEGIN':
      return {
        ...state,
        videoPreparing: false,
        recordingVideo: true,
        recordingElapsedSec: 0,
        captureError: null,
      };
    case 'VIDEO_SESSION_END':
      return {
        ...state,
        videoPreparing: false,
        recordingVideo: false,
        recordingElapsedSec: 0,
        cameraReady: false,
        captureMode: 'picture',
      };
    case 'PREPARE_STILL_CAPTURE':
      return { ...state, takingPicture: true, captureError: null };
    case 'SET_CAPTURE_MODE':
      return state.captureMode === action.captureMode
        ? state
        : { ...state, cameraReady: false, captureMode: action.captureMode };
    case 'SET_CAPTURE_ERROR':
      return state.captureError === action.captureError ? state : { ...state, captureError: action.captureError };
    case 'SET_TAKING_PICTURE':
      return state.takingPicture === action.takingPicture ? state : { ...state, takingPicture: action.takingPicture };
    case 'SET_RECORDING_ELAPSED_SEC':
      return state.recordingElapsedSec === action.recordingElapsedSec
        ? state
        : { ...state, recordingElapsedSec: action.recordingElapsedSec };
    case 'START_CAMERA_SWITCH':
      return {
        ...state,
        zoom: 0,
        isSwitchingCamera: true,
        captureError: null,
        facing: action.nextFacing,
      };
    case 'UPDATE_CAMERA_INSTANCE_KEY':
      return { ...state, cameraInstanceKey: action.updater(state.cameraInstanceKey) };
    case 'TOGGLE_FLASH':
      return { ...state, flash: state.flash === 'off' ? 'on' : 'off' };
    case 'TOGGLE_RECORD_AUDIO_MUTED':
      return { ...state, recordAudioMuted: !state.recordAudioMuted };
    default:
      return state;
  }
}
