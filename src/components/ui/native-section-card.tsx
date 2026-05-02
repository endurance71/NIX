import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../hooks/useAppTheme';
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  title: {
    ...typography.headline,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.footnote,
  },
  content: {
    gap: 8,
  },
});
