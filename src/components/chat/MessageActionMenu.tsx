import { Fragment, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '../../hooks/useAppTheme';
import { canUseLiquidGlass } from '../../lib/liquidGlass';
import { APP_ICON_SIZE, resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';

export type MessageActionMenuItem = {
  key: string;
  label: string;
  icon: AppIconName;
  destructive: boolean;
  /** Items with the same section sit together; a line separates sections (iOS 26 menus). */
  section: number;
  onPress: () => void;
};

export const MESSAGE_ACTION_MENU_WIDTH = 236;
const ROW_HEIGHT = 44;
const MENU_VERTICAL_PAD = 8;
const SECTION_BREAK = 17;
const MENU_RADIUS = 28;
const ICON_COLUMN = 26;

function sectionBreaks(items: readonly Pick<MessageActionMenuItem, 'section'>[]): number {
  return items.reduce((count, item, index) => (index > 0 && item.section !== items[index - 1].section ? count + 1 : count), 0);
}

/** Height of the menu for these items, for the overlay layout. */
export function messageActionMenuHeight(items: readonly Pick<MessageActionMenuItem, 'section'>[]): number {
  if (items.length === 0) return 0;
  return MENU_VERTICAL_PAD * 2 + items.length * ROW_HEIGHT + sectionBreaks(items) * SECTION_BREAK;
}

/**
 * The iMessage context menu under a long-pressed bubble: one glass card, the SF Symbol in front
 * of each label, a line between groups, destructive actions in red. The Tapback bar sits above.
 */
export function MessageActionMenu({
  items,
  focusRef,
}: {
  items: readonly MessageActionMenuItem[];
  /** First row, when there is no Tapback bar to take VoiceOver focus. */
  focusRef?: RefObject<View | null>;
}) {
  const { colors } = useAppTheme();
  const useGlass = canUseLiquidGlass();
  const rows = (
    <View style={styles.rows}>
      {items.map((item, index) => {
        const tint = item.destructive ? colors.destructive : colors.label;
        const newSection = index > 0 && item.section !== items[index - 1].section;
        return (
          <Fragment key={item.key}>
            {newSection ? (
              <View style={styles.sectionBreak}>
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
              </View>
            ) : null}
            <Pressable
              ref={index === 0 ? focusRef : undefined}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.systemFill } : null]}>
              <View style={styles.iconColumn}>
                <SymbolView
                  name={resolveAppIconName(item.icon)}
                  size={APP_ICON_SIZE.lg}
                  tintColor={tint}
                  weight="regular"
                />
              </View>
              <Text numberOfLines={1} style={[styles.label, { color: tint }]}>
                {item.label}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );

  if (useGlass) {
    return (
      <GlassView style={styles.menu} glassEffectStyle="regular" isInteractive>
        {rows}
      </GlassView>
    );
  }
  return <View style={[styles.menu, { backgroundColor: colors.secondarySystemBackground }]}>{rows}</View>;
}

const styles = StyleSheet.create({
  menu: {
    width: MESSAGE_ACTION_MENU_WIDTH,
    borderRadius: MENU_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  rows: {
    paddingVertical: MENU_VERTICAL_PAD,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  iconColumn: {
    width: ICON_COLUMN,
    alignItems: 'center',
  },
  label: {
    ...typography.body,
    flexShrink: 1,
  },
  sectionBreak: {
    height: SECTION_BREAK,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
