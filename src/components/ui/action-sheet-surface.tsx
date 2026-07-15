import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { SHEET_TOP_PADDING } from '../../theme/safeArea';
import { APP_FONT_FAMILY } from '../../theme/typography';
export { ActionSheetPrimaryButton, ActionSheetSecondaryButton } from './action-sheet-buttons';

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
};

export function ActionSheetSurface({
  title,
  message,
  contentAlign = 'center',
  children,
  actions,
  omitBottomInset = false,
  nativeBottomSheet = false,
}: ActionSheetSurfaceProps) {
  const { colors } = useAppTheme();
  const { topContentInset, bottomContentInset } = useScreenInsets('sheet');
  const styles = createStyles(
    nativeBottomSheet ? 'transparent' : colors.systemBackground,
    nativeBottomSheet ? SHEET_TOP_PADDING : topContentInset,
    nativeBottomSheet ? SHEET_TOP_PADDING : 16,
    resolveBottomPadding(nativeBottomSheet, omitBottomInset, bottomContentInset)
  );

  return (
    <View style={styles.screenRoot} collapsable={false}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
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
      gap: 10,
    },
    title: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      textAlign: 'center',
      fontFamily: APP_FONT_FAMILY,
      paddingHorizontal: 12,
    },
    message: {
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginBottom: 2,
      fontFamily: APP_FONT_FAMILY,
    },
    content: {
      gap: 10,
    },
    contentCenter: {
      alignItems: 'center',
    },
    contentStretch: {
      alignItems: 'stretch',
    },
    actions: {
      gap: 10,
      alignSelf: 'stretch',
      width: '100%',
    },
  });
