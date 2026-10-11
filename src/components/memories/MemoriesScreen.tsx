import { ActivityIndicator, Alert, Platform, StyleSheet, Text as RNText, View, useWindowDimensions } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';
import { Host, Text } from '@expo/ui';
import { Button, ContentUnavailableView, Image as SwiftImage, Toggle, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, font, foregroundStyle, frame, multilineTextAlignment, tint } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useMemoriesAlbum } from '../../hooks/useMemoriesAlbum';
import { getCurrentLocale } from '../../lib/i18n';
import { notify } from '../../lib/haptics';
import {
  MEMORIES_MAX_BYTES,
  formatMemoriesMegabytes,
  formatMemoriesMonth,
  formatMemoryDate,
  groupMemoriesByMonth,
  memoriesTotalBytes,
  type MemoryEntry,
} from '../../lib/memories';
import { resolveAppIconName } from '../../theme/app-icons';
import { typography } from '../../theme/typography';
import { MemoryGridCell } from './MemoryGridCell';

const COLUMNS = 3;
const GRID_GAP = 4;
/** The grid lines up with the toggle card and the month headers. */
const SIDE_INSET = 16;
const CELL_ALIGN = ['flex-start', 'center', 'flex-end'] as const;
const supportsContentUnavailableView = Number.parseFloat(String(Platform.Version)) >= 17;

type MemoriesRow =
  | { type: 'header'; key: string; title: string }
  | { type: 'item'; key: string; entry: MemoryEntry; column: number };

function buildRows(entries: readonly MemoryEntry[], locale: string): MemoriesRow[] {
  return groupMemoriesByMonth(entries).flatMap((section) => [
    { type: 'header' as const, key: `month-${section.key}`, title: formatMemoriesMonth(section.year, section.month, locale) },
    ...section.entries.map((entry, index) => ({
      type: 'item' as const,
      key: entry.id,
      entry,
      column: index % COLUMNS,
    })),
  ]);
}

/** Profile → Memories: the opt-in switch and the month-grouped grid of sent NiXes. */
export function MemoriesScreen() {
  const { t } = useTranslation();
  const { colors, colorScheme, statusBarStyle } = useAppTheme();
  const { width } = useWindowDimensions();
  const album = useMemoriesAlbum();
  const locale = getCurrentLocale();
  const entries = album.entries;
  const rows = entries ? buildRows(entries, locale) : [];
  const cellSize = Math.floor((width - SIDE_INSET * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS);
  const savingEnabled = album.preference === 'on';

  const cellLabel = (entry: MemoryEntry) => {
    const kind = t(entry.mediaType === 'video' ? 'memories.video' : 'memories.photo');
    const date = formatMemoryDate(entry.createdAt, locale);
    return entry.recipientNames.length > 0
      ? t('memories.itemA11yTo', { kind, date, names: entry.recipientNames.join(', ') })
      : t('memories.itemA11y', { kind, date });
  };

  const openMemory = (entry: MemoryEntry) => {
    router.push({ pathname: '/memory-viewer', params: { id: entry.id } });
  };

  const confirmDeleteAll = () => {
    Alert.alert(t('memories.deleteAllTitle'), t('memories.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('memories.deleteAll'),
        style: 'destructive',
        onPress: () => {
          void album.removeAll().then(
            () => notify('success'),
            () => notify('error'),
          );
        },
      },
    ]);
  };

  const header = (
    <View style={styles.header}>
      <View style={[styles.card, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
        <Host matchContents={{ vertical: true }} colorScheme={colorScheme} style={styles.stretch}>
          <Toggle
            isOn={savingEnabled}
            onIsOnChange={(value) => {
              void album.setSavingEnabled(value).catch(() => notify('error'));
            }}
            modifiers={[tint(colors.accent), frame({ maxWidth: Infinity })]}
            testID="memories-save-toggle">
            <Text modifiers={[font({ design: 'rounded', textStyle: 'body' }), foregroundStyle(colors.label)]}>
              {t('memories.saveToggle')}
            </Text>
          </Toggle>
        </Host>
      </View>
      <RNText style={[styles.footnote, { color: colors.secondaryLabel }]}>{t('memories.saveToggleFooter')}</RNText>
    </View>
  );

  const footer = entries && entries.length > 0 ? (
    <View style={styles.footer}>
      <RNText style={[styles.footnote, styles.centered, { color: colors.secondaryLabel }]}>
        {t('memories.storageFooter', {
          used: formatMemoriesMegabytes(memoriesTotalBytes(entries)),
          limit: formatMemoriesMegabytes(MEMORIES_MAX_BYTES),
        })}
      </RNText>
      <Host matchContents colorScheme={colorScheme}>
        <Button
          role="destructive"
          label={t('memories.deleteAll')}
          onPress={confirmDeleteAll}
          modifiers={[buttonStyle('borderless'), frame({ minHeight: 44 })]}
          testID="memories-delete-all"
        />
      </Host>
    </View>
  ) : null;

  const empty = entries === null ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={colors.label} accessibilityLabel={t('common.loading')} />
    </View>
  ) : (
    <View style={styles.emptyState}>
      <Host matchContents colorScheme={colorScheme}>
        {supportsContentUnavailableView ? (
          <ContentUnavailableView
            title={t('memories.emptyTitle')}
            description={t(savingEnabled ? 'memories.emptyMessageOn' : 'memories.emptyMessageOff')}
            systemImage={resolveAppIconName('memories')}
          />
        ) : (
          <VStack spacing={8} modifiers={[frame({ maxWidth: 320 })]}>
            <SwiftImage systemName={resolveAppIconName('memories')} size={40} color={colors.secondaryLabel} />
            <Text modifiers={[font({ design: 'rounded', textStyle: 'headline' }), foregroundStyle(colors.label)]}>
              {t('memories.emptyTitle')}
            </Text>
            <Text
              modifiers={[
                font({ design: 'rounded', textStyle: 'subheadline' }),
                foregroundStyle(colors.secondaryLabel),
                multilineTextAlignment('center'),
              ]}>
              {t(savingEnabled ? 'memories.emptyMessageOn' : 'memories.emptyMessageOff')}
            </Text>
          </VStack>
        )}
      </Host>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={statusBarStyle} />
      <Stack.Screen.Title style={{ color: colors.label }}>{t('memories.title')}</Stack.Screen.Title>
      <FlashList
        data={rows}
        numColumns={COLUMNS}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        overrideItemLayout={(layout, row) => {
          if (row.type === 'header') layout.span = COLUMNS;
        }}
        renderItem={({ item: row }) =>
          row.type === 'header' ? (
            <RNText accessibilityRole="header" style={[styles.monthHeader, { color: colors.label }]}>
              {row.title}
            </RNText>
          ) : (
            // Each column is a third of the inset width; pinning the outer cells to its edges keeps
            // the gaps between all three equal.
            <View style={[styles.cellWrap, { alignItems: CELL_ALIGN[row.column] }]}>
              <MemoryGridCell entry={row.entry} size={cellSize} accessibilityLabel={cellLabel(row.entry)} onPress={openMemory} />
            </View>
          )
        }
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SIDE_INSET,
    paddingBottom: 32,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  card: {
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  footnote: {
    ...typography.footnote,
    paddingHorizontal: 16,
  },
  centered: {
    textAlign: 'center',
  },
  monthHeader: {
    ...typography.headline,
    paddingTop: 20,
    paddingBottom: 8,
  },
  cellWrap: {
    paddingBottom: GRID_GAP,
  },
  footer: {
    paddingTop: 20,
    alignItems: 'center',
    gap: 4,
  },
  emptyState: {
    paddingTop: 64,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
});
