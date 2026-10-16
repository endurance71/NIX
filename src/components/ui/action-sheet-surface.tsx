import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { SHEET_TOP_PADDING } from '../../theme/safeArea';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { HostedSheetCloseButton, SHEET_CLOSE_BUTTON_SIZE } from './sheet-close-button';

export const ACTION_SHEET_AVATAR_SIZE = 96;

type ActionSheetSurfaceProps = {
  title: string;
  message?: string;
  contentAlign?: 'center' | 'stretch';
  children?: ReactNode;
  actions?: ReactNode;
  /** When parent already applies safe-area bottom inset (e.g. camera overlay panel). */
  omitBottomInset?: boolean;
  /**
   * Inside native `@expo/ui` BottomSheet: keep the RN layer transparent and use
   * one uniform content inset. The native sheet owns its safe area and material.
   */
  nativeBottomSheet?: boolean;
  /** Shows the system close button (xmark in a glass circle) at the top right, like every NiX sheet. */
  onClose?: () => void;
  closeDisabled?: boolean;
};

export function ActionSheetSurface({
  title,
  message,
  contentAlign = 'center',
  children,
  actions,
  omitBottomInset = false,
  nativeBottomSheet = false,
  onClose,
  closeDisabled = false,
}: ActionSheetSurfaceProps) {
  const { colors } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const styles = createStyles(
    nativeBottomSheet ? 'transparent' : colors.systemBackground,
    nativeBottomSheet ? SHEET_TOP_PADDING : topContentInset,
    nativeBottomSheet ? SHEET_TOP_PADDING : spacing.lg,
    resolveBottomPadding(nativeBottomSheet, omitBottomInset, bottomContentInset)
  );

  return (
    <View style={styles.screenRoot} collapsable={false}>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          {/* A matching blank on the left keeps the title centered next to the close button. */}
          {onClose ? <View style={styles.titleSide} /> : null}
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          {onClose ? (
            <View style={styles.titleSide}>
              <HostedSheetCloseButton onPress={onClose} disabled={closeDisabled} />
            </View>
          ) : null}
        </View>
        {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
        {children ? (
          <View style={[styles.content, contentAlign === 'stretch' ? styles.contentStretch : styles.contentCenter]}>
            {children}
          </View>
        ) : null}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    </View>
  );
}

function resolveBottomPadding(
  nativeBottomSheet: boolean,
  omitBottomInset: boolean,
  sheetInset: number
) {
  if (omitBottomInset) {
    return 0;
  }
  if (nativeBottomSheet) {
    return SHEET_TOP_PADDING;
  }
  return sheetInset;
}

const createStyles = (
  backgroundColor: string,
  topInset: number,
  horizontalInset: number,
  bottomInsetValue: number
) =>
  StyleSheet.create({
    screenRoot: {
      alignSelf: 'stretch',
      flexGrow: 0,
      width: '100%',
      backgroundColor,
    },
    container: {
      alignSelf: 'stretch',
      width: '100%',
      paddingHorizontal: horizontalInset,
      paddingTop: topInset,
      paddingBottom: bottomInsetValue,
      gap: spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    titleSide: {
      width: SHEET_CLOSE_BUTTON_SIZE,
      height: SHEET_CLOSE_BUTTON_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.title2,
      flex: 1,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
    message: {
      ...typography.subheadline,
      textAlign: 'center',
      marginBottom: spacing.xxs,
    },
    content: {
      gap: spacing.md,
    },
    contentCenter: {
      alignItems: 'center',
    },
    contentStretch: {
      alignItems: 'stretch',
    },
    actions: {
      gap: spacing.sm,
      alignSelf: 'stretch',
      width: '100%',
    },
  });
