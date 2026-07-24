import { StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

const TIMER_TRACK_HEIGHT = 8;

/** Cinema surfaces stay black in both light and dark (same as camera / preview). */
const VIEWER_CINEMA_BACKGROUND = '#000000';

export function createViewerStyles(colors: ThemeColors) {
  const progressBlue = colors.systemBlue;
  const trackSoftWhite = colors.viewerChromeFill;
  const chromeTint = colors.cameraControlTint;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: VIEWER_CINEMA_BACKGROUND,
      justifyContent: 'center',
      alignItems: 'center',
    },
    timerHudShell: {
      position: 'absolute',
      left: 16,
      right: 16,
      borderRadius: 12,
      overflow: 'hidden',
      zIndex: 10,
    },
    timerBlur: {
      ...StyleSheet.absoluteFill,
    },
    timerHudInner: {
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    segmentsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    segmentCell: {
      flex: 1,
      minWidth: 0,
    },
    timerTrack: {
      height: TIMER_TRACK_HEIGHT,
      borderRadius: TIMER_TRACK_HEIGHT / 2,
      overflow: 'hidden',
      backgroundColor: trackSoftWhite,
    },
    segmentFill: {
      ...StyleSheet.absoluteFill,
      backgroundColor: trackSoftWhite,
    },
    segmentFillDone: {
      ...StyleSheet.absoluteFill,
      backgroundColor: progressBlue,
    },
    segmentProgressMask: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '100%',
      borderRadius: TIMER_TRACK_HEIGHT / 2,
      backgroundColor: progressBlue,
      transformOrigin: 'left center',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageContainer: {
      width: '100%',
      height: '100%',
      backgroundColor: VIEWER_CINEMA_BACKGROUND,
    },
    dismissArea: {
      ...StyleSheet.absoluteFill,
      zIndex: 5,
    },
    safetyButton: {
      position: 'absolute',
      right: 16,
      zIndex: 15,
      minWidth: 44,
      minHeight: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.viewerChromeFill,
    },
    safetyButtonText: {
      ...typography.callout,
      color: chromeTint,
      fontWeight: '800',
      letterSpacing: 1,
    },
    loadingOverlaySolid: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      zIndex: 6,
    },
    errorOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: VIEWER_CINEMA_BACKGROUND,
      paddingHorizontal: 24,
    },
    captureBlurMask: {
      ...StyleSheet.absoluteFill,
      backgroundColor: VIEWER_CINEMA_BACKGROUND,
      zIndex: 20,
    },
    errorText: {
      ...typography.callout,
      color: chromeTint,
      textAlign: 'center',
      marginBottom: 14,
    },
    backButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.viewerChromeFill,
    },
    backButtonText: {
      ...typography.footnote,
      color: chromeTint,
      fontWeight: '700',
    },
  });
}
