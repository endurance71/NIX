type CameraPermission = { granted: boolean; canAskAgain: boolean } | null;

export async function performCameraPermissionRequest(
  permission: CameraPermission,
  actions: { request: () => Promise<unknown>; openSettings: () => Promise<unknown> }
) {
  if (permission?.granted) return;
  if (permission?.canAskAgain === false) await actions.openSettings();
  else await actions.request();
}
