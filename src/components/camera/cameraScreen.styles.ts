import { StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';
import { FOCUS_INDICATOR_SIZE } from '../../lib/cameraFocusPoint';

export function createCameraStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.cinemaBackground,
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
    camera: {
      flex: 1,
      backgroundColor: colors.cinemaBackground,
    },
    previewTouchArea: {
      flex: 1,
    },
    previewCover: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.cinemaBackground,
    },
    focusIndicator: {
      position: 'absolute',
      width: FOCUS_INDICATOR_SIZE,
      height: FOCUS_INDICATOR_SIZE,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: 4,
      borderCurve: 'continuous',
    },
    focusLockBadgeSlot: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 20,
    },
    focusLockBadge: {
      ...typography.footnote,
      fontWeight: '600',
      color: colors.onAccent,
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      borderCurve: 'continuous',
      overflow: 'hidden',
    },
    cameraOverlay: {
      ...StyleSheet.absoluteFill,
    },
    flashOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.cameraControlTint,
    },
    frontScreenFlash: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.screenFlash,
      zIndex: 100,
    },
    // While recording, a ring light plus a white wash over the preview light the face; the
    // preview stays faintly visible for framing.
    frontRingLight: {
      ...StyleSheet.absoluteFill,
      borderWidth: 44,
      borderColor: colors.screenFlash,
      borderRadius: 56,
    },
    frontRecordingWash: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.screenFlash,
      opacity: 0.6,
    },
    controlsContainer: {
      flex: 1,
      justifyContent: 'space-between',
    },
    recordingTimerTopLeft: {
      justifyContent: 'center',
      minHeight: 48,
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
    topControlTrailingSpacer: {
      width: 48,
      height: 48,
    },
    bottomControls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: 32,
      minHeight: 130,
    },
    sideButtonContainer: {
      width: 60,
      height: 76,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    shutterStack: {
      width: 220,
      height: 130,
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'visible',
    },
    // Above the lens switcher (its own layer), so a message never hides the lenses.
    captureStatusSlot: {
      position: 'absolute',
      bottom: 154,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 3,
    },
    lensSwitcherSlot: {
      position: 'absolute',
      bottom: 96,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 2,
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
    shutterHitArea: {
      // Keep hit target on the shutter disk — large padding stole taps from the lens switcher above.
      paddingHorizontal: 8,
      paddingVertical: 4,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    // While recording the white ring dims into a track for the red progress arc.
    shutterRecording: {
      borderColor: colors.cinemaTrack,
    },
    shutterInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      borderCurve: 'continuous',
      backgroundColor: colors.cameraControlTint,
    },
    recordingRing: {
      position: 'absolute',
      top: -4,
      left: -4,
      width: 76,
      height: 76,
    },
    shutterDisabled: {
      opacity: 0.55,
    },
  });
}
