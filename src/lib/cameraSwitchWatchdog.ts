type CameraFacing = 'back' | 'front';

type WatchdogParams = {
  nextFacing: CameraFacing;
  isSwitchingCameraRef: { current: boolean };
  cameraReadyRef: { current: boolean };
  switchRecoveryUsedRef: { current: boolean };
  switchWatchdogRef: { current: ReturnType<typeof setTimeout> | null };
  setCameraInstanceKey: (updater: (current: number) => number) => void;
  setIsSwitchingCamera: (value: boolean) => void;
  onSwitchTimeout: (payload: { facing: CameraFacing; recoveryAttempted: boolean }) => void;
  onSwitchFailure: () => void;
};

export function scheduleCameraSwitchWatchdog(params: WatchdogParams) {
  const {
    nextFacing,
    isSwitchingCameraRef,
    cameraReadyRef,
    switchRecoveryUsedRef,
    switchWatchdogRef,
    setCameraInstanceKey,
    setIsSwitchingCamera,
    onSwitchTimeout,
    onSwitchFailure,
  } = params;

  if (switchWatchdogRef.current) {
    clearTimeout(switchWatchdogRef.current);
  }

  switchWatchdogRef.current = setTimeout(() => {
    switchWatchdogRef.current = null;
    if (!isSwitchingCameraRef.current) return;
    if (cameraReadyRef.current) return;

    onSwitchTimeout({
      facing: nextFacing,
      recoveryAttempted: !switchRecoveryUsedRef.current,
    });

    if (!switchRecoveryUsedRef.current) {
      switchRecoveryUsedRef.current = true;
      setCameraInstanceKey((k) => k + 1);

      switchWatchdogRef.current = setTimeout(() => {
        switchWatchdogRef.current = null;
        if (!isSwitchingCameraRef.current) return;
        if (cameraReadyRef.current) return;

        onSwitchTimeout({
          facing: nextFacing,
          recoveryAttempted: false,
        });

        isSwitchingCameraRef.current = false;
        switchRecoveryUsedRef.current = false;
        setIsSwitchingCamera(false);
        onSwitchFailure();
      }, 4000);
      return;
    }

    isSwitchingCameraRef.current = false;
    switchRecoveryUsedRef.current = false;
    setIsSwitchingCamera(false);
    onSwitchFailure();
  }, 4000);
}

