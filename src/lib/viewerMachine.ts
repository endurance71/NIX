export type ViewerMachineError = {
  kind: 'transient' | 'permanentMissing';
  message: string;
  reason: string;
};

export type ViewerMachineState =
  | { status: 'booting'; error: null }
  | { status: 'loadingMedia'; error: null }
  | { status: 'ready'; error: null }
  | { status: 'transientError'; error: ViewerMachineError }
  | { status: 'permanentMissing'; error: ViewerMachineError }
  | { status: 'closing'; error: null };

export type ViewerMachineAction =
  | { type: 'boot' }
  | { type: 'load' }
  | { type: 'ready' }
  | { type: 'fail'; error: ViewerMachineError }
  | { type: 'close' };

export const initialViewerMachineState: ViewerMachineState = {
  status: 'booting',
  error: null,
};

export function viewerMachineReducer(
  state: ViewerMachineState,
  action: ViewerMachineAction
): ViewerMachineState {
  if (state.status === 'closing' && action.type !== 'boot') return state;

  switch (action.type) {
    case 'boot':
      return initialViewerMachineState;
    case 'load':
      return { status: 'loadingMedia', error: null };
    case 'ready':
      return { status: 'ready', error: null };
    case 'fail':
      return {
        status: action.error.kind === 'permanentMissing' ? 'permanentMissing' : 'transientError',
        error: action.error,
      };
    case 'close':
      return { status: 'closing', error: null };
  }
}
