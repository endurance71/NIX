import { StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';

/** Stories-style progress segments. */
const SEGMENT_HEIGHT = 3;
export const VIEWER_AVATAR_SIZE = 32;
export const VIEWER_CHROME_BUTTON_SIZE = 44;

/** Cinema surfaces stay black in both light and dark (same as camera / preview). */
export function createViewerStyles(colors: ThemeColors) {
  const chromeTint = colors.cameraControlTint;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    bootContainer: {
      flex: 1,
      backgroundColor: colors.cinemaBackground,
      justifyContent: 'center',
      alignItems: 'center',
    },
    /** Dims away while swiping down, revealing the screen under the modal. */
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.cinemaBackground,
    },
    stage: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.cinemaBackground,
      overflow: 'hidden',
      borderCurve: 'continuous',
      justifyContent: 'center',
      alignItems: 'center',
    },
    topScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      experimental_backgroundImage: `linear-gradient(180deg, ${colors.cinemaScrim} 0%, transparent 100%)`,
    },
    bottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      experimental_backgroundImage: `linear-gradient(0deg, ${colors.cinemaScrim} 0%, transparent 100%)`,
    },
    chromeLayer: {
      ...StyleSheet.absoluteFill,
      zIndex: 10,
    },
    hud: {
      position: 'absolute',
      left: 8,
      right: 8,
      flexDirection: 'row',
      gap: 3,
    },
    segmentTrack: {
      flex: 1,
      minWidth: 0,
      height: SEGMENT_HEIGHT,
      borderRadius: SEGMENT_HEIGHT / 2,
      overflow: 'hidden',
      backgroundColor: colors.cinemaTrack,
    },
    segmentFillDone: {
      ...StyleSheet.absoluteFill,
      backgroundColor: chromeTint,
    },
    /** Absolute and childless, so animating `width` keeps the rounded end crisp. */
    segmentFillActive: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: SEGMENT_HEIGHT / 2,
      backgroundColor: chromeTint,
    },
    header: {
      position: 'absolute',
      left: 12,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    senderInfo: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    senderText: {
      flexShrink: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    senderName: {
      ...typography.headline,
      color: chromeTint,
      flexShrink: 1,
    },
    senderTime: {
      ...typography.footnote,
      color: colors.cinemaSecondaryLabel,
      fontVariant: ['tabular-nums'],
    },
    headerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageContainer: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.cinemaBackground,
    },
    /** Previous photo kept under the next one until it is ready (no black flash). */
    heldFrame: {
      ...StyleSheet.absoluteFill,
    },
    /** Poster above the VideoView until its first frame (PERF-20). */
    videoPosterLayer: {
      ...StyleSheet.absoluteFill,
    },
    touchLayer: {
      ...StyleSheet.absoluteFill,
      zIndex: 5,
    },
    bottomBar: {
      position: 'absolute',
      left: 12,
      right: 12,
      gap: 10,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    /** Reaction confirmation: one large glyph over the centre of the media. */
    reactionPopLayer: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 7,
    },
    reactionPopGlyph: {
      fontSize: 96,
      lineHeight: 112,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 6,
    },
    errorOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cinemaBackground,
      paddingHorizontal: 24,
      gap: 10,
      zIndex: 25,
    },
    captureMask: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.cinemaBackground,
      zIndex: 30,
    },
    errorText: {
      ...typography.callout,
      color: chromeTint,
      textAlign: 'center',
      marginBottom: 4,
    },
  });
}
