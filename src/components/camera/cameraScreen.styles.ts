import { StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

export function createCameraStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    permissionContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    permissionText: {
      color: colors.textPrimary,
      ...typography.callout,
      textAlign: 'center',
      marginBottom: 24,
      fontWeight: '500',
      letterSpacing: 0.2,
    },
    permissionHint: {
      color: colors.textSecondary,
      ...typography.footnote,
      textAlign: 'center',
      marginBottom: 20,
    },
    permissionButton: {
      backgroundColor: colors.buttonPrimaryBg,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 24,
    },
    permissionButtonText: {
      color: colors.buttonPrimaryText,
      ...typography.callout,
      fontWeight: '600',
    },
    camera: {
      flex: 1,
    },
    cameraOverlay: {
      ...StyleSheet.absoluteFill,
    },
    flashOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.background,
    },
    controlsContainer: {
      flex: 1,
      justifyContent: 'space-between',
    },
    recordingTimerTopLeft: {
      justifyContent: 'center',
      minHeight: 48,
    },
    recordingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: colors.cameraControlBackground,
    },
    recordingDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.destructive,
    },
    recordingHudText: {
      ...typography.callout,
      fontVariant: ['tabular-nums'],
      color: colors.cameraControlTint,
      fontWeight: '700',
    },
    topControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    topLeadingCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    topTrailingCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    topControlTrailingSpacer: {
      width: 48,
      height: 48,
    },
    bottomControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    sideButtonContainer: {
      width: 60,
      alignItems: 'center',
    },
    shutterStack: {
      alignItems: 'center',
      gap: 10,
    },
    captureError: {
      ...typography.footnote,
      maxWidth: 220,
      color: colors.cameraControlTint,
      textAlign: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderCurve: 'continuous',
      backgroundColor: colors.cameraControlBackground,
      overflow: 'hidden',
    },
    captureHint: {
      ...typography.footnote,
      maxWidth: 220,
      color: colors.cameraControlTint,
      textAlign: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderCurve: 'continuous',
      backgroundColor: colors.cameraControlBackground,
      overflow: 'hidden',
      opacity: 0.85,
    },
    shutterOuter: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 4,
      borderColor: colors.cameraControlTint,
      justifyContent: 'center',
      alignItems: 'center',
    },
    shutterRecording: {
      borderColor: colors.destructive,
    },
    shutterInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: colors.cameraControlTint,
    },
    shutterInnerRecording: {
      borderRadius: 12,
      width: 44,
      height: 44,
      backgroundColor: colors.destructive,
    },
    shutterDisabled: {
      opacity: 0.55,
    },
  });
}
