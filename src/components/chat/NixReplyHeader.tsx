import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
import type { ChatNixReplyContext } from '../../lib/chatNixReply';

/** Inset of the connector from the bubble's outer edge, roughly under the bubble's corner. */
const CONNECTOR_INSET = 18;

/**
 * iMessage / Snapchat-style quoted header attached above a text bubble that answers a NiX: a
 * compact pill (photo / video symbol + „Odpowiedź na …”) and a short connector down to the bubble,
 * on the bubble's side. Tapping it scrolls to the NiX when it is in the chat.
 *
 * Decorative for VoiceOver: the bubble's label carries the reply context and its rotor offers
 * „Pokaż NiX-a”, so the header is not a second stop.
 */
export function NixReplyHeader({
  context,
  label,
  isOwn,
  onPress,
}: {
  context: ChatNixReplyContext;
  label: string;
  isOwn: boolean;
  onPress: ((nixId: string) => void) | null;
}) {
  const { colors } = useAppTheme();
  const canJump = context.inTimeline && onPress !== null;
  return (
    <View
      style={[styles.column, isOwn ? styles.alignOwn : styles.alignIncoming]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Pressable
        disabled={!canJump}
        onPress={canJump ? () => onPress(context.nixId) : undefined}
        hitSlop={6}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.secondarySystemFill, opacity: pressed ? 0.6 : 1 },
        ]}>
        <SymbolView
          name={resolveAppIconName(context.kind === 'video' ? 'statusVideo' : 'statusPhoto')}
          size={APP_ICON_SIZE.xs}
          tintColor={colors.accent}
          weight="semibold"
        />
        <Text numberOfLines={1} style={[styles.label, { color: colors.secondaryLabel }]}>
          {label}
        </Text>
      </Pressable>
      <View
        style={[
          styles.connector,
          { backgroundColor: colors.secondarySystemFill },
          isOwn ? styles.connectorOwn : styles.connectorIncoming,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    maxWidth: '100%',
  },
  alignOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  alignIncoming: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  label: {
    ...typography.footnote,
    flexShrink: 1,
  },
  connector: {
    width: 2,
    height: 6,
    borderRadius: 1,
  },
  connectorOwn: {
    marginRight: CONNECTOR_INSET,
  },
  connectorIncoming: {
    marginLeft: CONNECTOR_INSET,
  },
});
