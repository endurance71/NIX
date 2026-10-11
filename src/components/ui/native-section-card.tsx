import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type NativeSectionCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  /** Domyślnie od lewej; `center` — jak natywne arkusze potwierdzenia */
  textAlign?: 'left' | 'center';
}>;

export function NativeSectionCard({ title, subtitle, children, textAlign = 'left' }: NativeSectionCardProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.card, { borderColor: colors.separator, backgroundColor: colors.secondarySystemBackground }]}>
      <Text style={[styles.title, textAlignStyle(textAlign), { color: colors.label }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, textAlignStyle(textAlign), { color: colors.secondaryLabel }]}>{subtitle}</Text>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function textAlignStyle(align: 'left' | 'center') {
  return { textAlign: align } as const;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.button,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.headline,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.footnote,
  },
  content: {
    gap: spacing.sm,
  },
});
