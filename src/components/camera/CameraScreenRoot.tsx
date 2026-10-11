import { router } from 'expo-router';
import {
  CameraInitializingPlaceholder,
  CameraPermissionDeniedPlaceholder,
} from './CameraPermissionScreens';
import { useCameraScreen } from '../../hooks/useCameraScreen';
import { CameraCaptureSurface } from './CameraCaptureSurface';

export default function CameraScreenRoot() {
  const vm = useCameraScreen();

  if (!vm.permission) {
    return (
      <CameraInitializingPlaceholder
        timedOut={vm.permissionLoadingTimedOut}
        onNavigateInbox={() => router.replace('/(tabs)/inbox')}
        styles={{
          permissionContainer: vm.styles.permissionContainer,
          permissionText: vm.styles.permissionText,
          permissionHint: vm.styles.permissionHint,
        }}
      />
    );
  }

  if (!vm.permissionGranted) {
    return (
      <CameraPermissionDeniedPlaceholder
        onRequestPermission={() => { void vm.handleCameraPermission(); }}
        canAskAgain={vm.permission?.canAskAgain !== false}
        styles={{
          permissionContainer: vm.styles.permissionContainer,
          permissionText: vm.styles.permissionText,
        }}
      />
    );
  }

  return <CameraCaptureSurface vm={vm} />;
}
