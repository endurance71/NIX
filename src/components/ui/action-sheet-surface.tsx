import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_FONT_FAMILY } from '../../theme/typography';
import type { ThemeColors } from '../../theme/colors';
import { useScreenInsets } from '../../hooks/useScreenInsets';
export { ActionSheetPrimaryButton, ActionSheetSecondaryButton } from './action-sheet-buttons';

export const ACTION_SHEET_AVATAR_SIZE = 96;
const COMPACT_SHEET_TOP_PADDING = 18;

type ActionSheetSurfaceProps = {
  title: string;
  message?: string;
  contentAlign?: 'center' | 'stretch';
  children?: ReactNode;
  actions?: ReactNode;
};

export function ActionSheetSurface({ title, message, contentAlign = 'center', children, actions }: ActionSheetSurfaceProps) {
  const { colors } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('sheet');
  const styles = createStyles(colors, bottomContentInset);

  return (
    <View style={styles.screenRoot}>
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

const createStyles = (colors: ThemeColors, bottomInset: number) =>
  StyleSheet.create({
    screenRoot: {
      alignSelf: 'stretch',
      flexGrow: 0,
      width: '100%',
    },
    container: {
      alignSelf: 'stretch',
      width: '100%',
      paddingHorizontal: 24,
      paddingTop: COMPACT_SHEET_TOP_PADDING,
      paddingBottom: bottomInset,
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
