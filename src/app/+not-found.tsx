import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../hooks/useAppTheme';
import { Button } from '../components/ui/button';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
      <Text style={[styles.symbol, { color: colors.tertiaryLabel }]}>!</Text>
      <Text style={[styles.title, { color: colors.label }]}>{t('notFound.title')}</Text>
      <Text selectable style={[styles.message, { color: colors.secondaryLabel }]}>
        {t('notFound.message')}
      </Text>
      <Button title={t('notFound.backToApp')} onPress={() => router.replace('/(tabs)')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  symbol: {
    ...typography.largeTitle,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
});
