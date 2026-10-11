import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from '../../hooks/useAppTheme';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';

/** Inset of the connector from the bubble's outer edge, like NixReplyHeader. */
const CONNECTOR_INSET = 18;

/**
 * iMessage-style quote above a reply: a faded mini bubble with the quoted author and up to two
 * lines of the quoted text (or „Wiadomość głosowa”), joined to the reply by a short connector on
 * the bubble's side. Tapping it scrolls to the quoted message when it is loaded.
 *
 * Decorative for VoiceOver: the bubble's label reads the quote and its rotor offers „Pokaż
 * cytowaną wiadomość”.
 */
export function MessageReplyHeader({
  author,
  snippet,
  isVoice,
  isOwn,
  onPress,
}: {
  author: string;
  snippet: string;
  isVoice: boolean;
  isOwn: boolean;
  onPress: (() => void) | null;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.column, isOwn ? styles.alignOwn : styles.alignIncoming]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Pressable
        disabled={!onPress}
        onPress={onPress ?? undefined}
        hitSlop={6}
        style={({ pressed }) => [
          styles.quote,
          { backgroundColor: colors.secondarySystemFill, opacity: pressed ? 0.6 : 1 },
        ]}>
        <Text numberOfLines={1} style={[styles.author, { color: colors.secondaryLabel }]}>
          {author}
        </Text>
        <View style={styles.snippetRow}>
          {isVoice ? (
            <SymbolView
              name={resolveAppIconName('micFill')}
              size={APP_ICON_SIZE.xs}
              tintColor={colors.secondaryLabel}
              weight="semibold"
            />
          ) : null}
          <Text numberOfLines={2} style={[styles.snippet, { color: colors.secondaryLabel }]}>
            {snippet}
          </Text>
        </View>
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
  quote: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderCurve: 'continuous',
    gap: 1,
  },
  author: {
    ...typography.caption,
    fontWeight: '600',
  },
  snippetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  snippet: {
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
