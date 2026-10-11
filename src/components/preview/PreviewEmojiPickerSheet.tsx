import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { selection } from '../../lib/haptics';
import { CURATED_STICKER_EMOJI, extractFirstEmoji } from '../../lib/previewStickers';
import { MAX_EMOJI_STICKERS } from '../../types/mediaStickerOverlay';
import { typography } from '../../theme/typography';
import { SHEET_TOP_PADDING } from '../../theme/safeArea';
import { AppBottomSheet } from '../ui/app-bottom-sheet';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';

const COLUMNS = 8;
const HORIZONTAL_PADDING = 16;

type PreviewEmojiPickerSheetProps = {
  isPresented: boolean;
  onDismiss: () => void;
  onPick: (emoji: string) => void;
  /** False at the sticker limit: the grid is disabled and a note explains why. */
  canAdd: boolean;
};

/** Curated emoji grid plus a field for any emoji from the system keyboard. */
export function PreviewEmojiPickerSheet({
  isPresented,
  onDismiss,
  onPick,
  canAdd,
}: PreviewEmojiPickerSheetProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState('');
  const cellSize = Math.floor((width - HORIZONTAL_PADDING * 2) / COLUMNS);
  const typedEmoji = extractFirstEmoji(draft);

  const pick = (emoji: string) => {
    if (!canAdd) return;
    selection();
    setDraft('');
    onPick(emoji);
  };

  return (
    <AppBottomSheet isPresented={isPresented} onDismiss={onDismiss} testID="preview-emoji-sheet">
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.label }]} accessibilityRole="header">
            {t('preview.stickerSheetTitle')}
          </Text>
          <NativeChromeIconButton
            name="close"
            accessibilityLabel={t('common.cancel')}
            onPress={onDismiss}
            size={40}
            backgroundColor={colors.secondarySystemFill}
            tintColor={colors.label}
            chromeVariant="solid"
          />
        </View>

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('preview.stickerInputPlaceholder')}
            placeholderTextColor={colors.secondaryLabel}
            accessibilityLabel={t('preview.stickerInputA11y')}
            returnKeyType="done"
            autoCorrect={false}
            onSubmitEditing={() => {
              if (typedEmoji) pick(typedEmoji);
            }}
            style={[
              styles.input,
              { color: colors.label, backgroundColor: colors.secondarySystemFill },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !typedEmoji || !canAdd }}
            disabled={!typedEmoji || !canAdd}
            onPress={() => {
              if (typedEmoji) pick(typedEmoji);
            }}
            style={[
              styles.addButton,
              { backgroundColor: colors.accent, opacity: typedEmoji && canAdd ? 1 : 0.4 },
            ]}>
            <Text style={[styles.addLabel, { color: colors.onAccent }]}>
              {typedEmoji ? `${t('preview.stickerAdd')} ${typedEmoji}` : t('preview.stickerAdd')}
            </Text>
          </Pressable>
        </View>

        {!canAdd ? (
          <Text style={[styles.note, { color: colors.secondaryLabel }]}>
            {t('preview.stickerLimit', { count: MAX_EMOJI_STICKERS })}
          </Text>
        ) : null}

        <View style={styles.grid}>
          {CURATED_STICKER_EMOJI.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={emoji}
              accessibilityState={{ disabled: !canAdd }}
              disabled={!canAdd}
              onPress={() => pick(emoji)}
              style={({ pressed }) => [
                styles.cell,
                { width: cellSize, height: cellSize, opacity: canAdd ? 1 : 0.4 },
                pressed ? { backgroundColor: colors.secondarySystemFill } : null,
              ]}>
              <Text style={styles.cellEmoji} allowFontScaling={false}>
                {emoji}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: SHEET_TOP_PADDING,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 24,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.headline,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    ...typography.headline,
  },
  note: {
    ...typography.footnote,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  cellEmoji: {
    fontSize: 30,
  },
});
