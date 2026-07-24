import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { ChatScreenViewModel, OptimisticTextMessage } from '../../hooks/useChatScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { buildUnifiedChatTimeline, type ChatTimelineItem, type UnifiedChatTextMessage } from '../../lib/chatTimeline';
import type { ChatNixEvent } from '../../services/nixService';
import { typography } from '../../theme/typography';

type ChatScreenSurfaceProps = {
  vm: ChatScreenViewModel;
};

export type ChatComposerProps = {
  vm: ChatScreenViewModel;
};

const BUBBLE_CORNER_RADIUS = 18;
const BUBBLE_MAX_WIDTH_RATIO = 0.72;
const COMPOSER_CONTROL_SIZE = 44;
const COMPOSER_CONTENT_HEIGHT = 78;
/** Soft scroll-edge fade nad composerem (zamiast Stack.Toolbar). */
const COMPOSER_EDGE_FADE_EXTRA = 48;

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

function MessageBubble({
  message,
  isOwn,
  maxWidth,
  onReport,
}: {
  message: OptimisticTextMessage;
  isOwn: boolean;
  maxWidth: number;
  onReport: () => void;
}) {
  const { colors } = useAppTheme();
  const bubbleBg = isOwn ? colors.accent : colors.chatBubbleIncoming;
  const labelColor = isOwn ? colors.onChatBubbleOwn : colors.label;

  const content = (
    <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
      <Text style={[styles.bubbleText, { color: labelColor }]}>{message.body}</Text>
      {message.isSending ? (
        <ActivityIndicator size="small" color={labelColor} style={styles.sendingSpinner} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.row}>
      {isOwn ? (
        <View style={[styles.bubbleAnchor, styles.bubbleOwn, { maxWidth }]}>{content}</View>
      ) : (
        <Pressable
          onLongPress={onReport}
          delayLongPress={350}
          accessibilityRole="button"
          style={[styles.bubbleAnchor, styles.bubbleIncoming, { maxWidth }]}>
          {content}
        </Pressable>
      )}
    </View>
  );
}

function nixStatusLabel(nix: ChatNixEvent, t: ChatScreenViewModel['t']): string {
  if (nix.direction === 'sent') {
    if (nix.status === 'viewed' || nix.status === 'cleaned' || nix.is_viewed) {
      return t('chat.nixOpened');
    }
    return t('chat.nixSent');
  }
  if (!nix.is_viewed && nix.status === 'sent') return t('chat.nixNew');
  return t('chat.nixOpened');
}

function nixTitle(nix: ChatNixEvent, t: ChatScreenViewModel['t']): string {
  return nix.direction === 'sent' ? t('chat.nixSentLabel') : t('chat.nixReceivedLabel');
}

function NixChip({
  nix,
  maxWidth,
  onPress,
  t,
}: {
  nix: ChatNixEvent;
  maxWidth: number;
  onPress: () => void;
  t: ChatScreenViewModel['t'];
}) {
  const { colors } = useAppTheme();
  const isOwn = nix.direction === 'sent';
  const canOpen = nix.direction === 'received' && !nix.is_viewed && Boolean(nix.media_path);
  const bubbleBg = canOpen ? colors.accent : colors.secondarySystemFill;
  const titleColor = canOpen ? colors.onChatBubbleOwn : colors.label;
  const statusColor = canOpen ? colors.onChatBubbleOwn : colors.secondaryLabel;
  const statusText =
    nix.media_type === 'video'
      ? `${nixStatusLabel(nix, t)} · ${t('chat.nixVideo')}`
      : nixStatusLabel(nix, t);

  const chip = (
    <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
      <Text style={[styles.chipTitle, { color: titleColor }]}>{nixTitle(nix, t)}</Text>
      <Text style={[styles.chipStatus, { color: statusColor }]}>{statusText}</Text>
    </View>
  );

  return (
    <View style={styles.row}>
      {canOpen ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={[styles.bubbleAnchor, isOwn ? styles.bubbleOwn : styles.bubbleIncoming, { maxWidth }]}>
          {chip}
        </Pressable>
      ) : (
        <View style={[styles.bubbleAnchor, isOwn ? styles.bubbleOwn : styles.bubbleIncoming, { maxWidth }]}>
          {chip}
        </View>
      )}
    </View>
  );
}

function DateSeparator({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.separatorRow}>
      <Text style={[styles.separatorText, { color: colors.secondaryLabel }]}>{label}</Text>
    </View>
  );
}

/**
 * Overlay nad FlashList — `GlassView` (expo-glass-effect) sampluje bąbelki pod spodem.
 * Pozycja względem klawiatury: `bottom: keyboardHeight` (bez KeyboardAvoidingView —
 * KAV + absolute composer zostawia szary pas między barem a klawiaturą).
 */
function ChatComposer({ vm }: ChatComposerProps) {
  const { colors } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('stackHeader');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const canSend = Boolean(vm.inputBody.trim()) && !vm.sending;
  const useGlass = canUseLiquidGlass();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboardOpen = keyboardHeight > 0;
  const composerBottomPad = keyboardOpen ? 8 : Math.max(bottomContentInset, 10);
  const fallbackFill = { backgroundColor: colors.secondarySystemFill };
  /**
   * Jak scroll-edge pod headerem: tylko miękki fade do systemBackground.
   * BlurView tu zbierał kolor bąbelków (fioletowy „glow”) — nie jak u góry.
   */
  const bg = colors.systemBackground.length >= 7 ? colors.systemBackground.slice(0, 7) : colors.systemBackground;
  const edgeFadeHeight = COMPOSER_CONTENT_HEIGHT + composerBottomPad + COMPOSER_EDGE_FADE_EXTRA;

  const inputField = (
    <TextInput
      key={vm.composerKey}
      defaultValue={vm.inputBody}
      placeholder={vm.t('chat.typeMessage')}
      placeholderTextColor={colors.secondaryLabel}
      onChangeText={vm.setInputBody}
      onSubmitEditing={() => void vm.handleSend()}
      editable={!vm.sending}
      returnKeyType="send"
      style={[styles.inputText, { color: colors.label }]}
    />
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.composerShell,
        {
          bottom: keyboardHeight,
          paddingBottom: composerBottomPad,
        },
      ]}>
      <LinearGradient
        pointerEvents="none"
        colors={[`${bg}00`, `${bg}D9`, `${bg}FF`]}
        locations={[0, 0.4, 1]}
        style={[styles.composerEdgeFade, { height: edgeFadeHeight }]}
      />

      <View style={styles.composerRow}>
        {useGlass ? (
          <GlassView style={styles.inputGlass} glassEffectStyle="regular" isInteractive>
            {inputField}
          </GlassView>
        ) : (
          <View style={[styles.inputGlass, fallbackFill]}>{inputField}</View>
        )}

        <Pressable
          onPress={() => void vm.handleSend()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={vm.t('chat.send')}
          accessibilityState={{ disabled: !canSend }}>
          {useGlass ? (
            <GlassView style={styles.sendGlass} glassEffectStyle="regular" isInteractive>
              <SymbolView
                name={'arrow.up' as SFSymbol}
                size={18}
                tintColor={colors.accent}
                weight="semibold"
                style={{ opacity: canSend ? 1 : 0.4 }}
              />
            </GlassView>
          ) : (
            <View style={[styles.sendGlass, fallbackFill, { opacity: canSend ? 1 : 0.4 }]}>
              <SymbolView
                name={'arrow.up' as SFSymbol}
                size={18}
                tintColor={colors.accent}
                weight="semibold"
              />
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.label }]} numberOfLines={2}>
          {vm.t('chat.disappearsFooter')}
        </Text>
        <Text style={[styles.footerCounter, { color: colors.label }]}>
          {`${vm.inputBody.length}/2000`}
        </Text>
      </View>
    </View>
  );
}

export function ChatScreenSurface({ vm }: ChatScreenSurfaceProps) {
  const { colors } = useAppTheme();
  const { bottomContentInset } = useScreenInsets('stackHeader');
  const { width: windowWidth } = useWindowDimensions();
  const bubbleMaxWidth = Math.round(windowWidth * BUBBLE_MAX_WIDTH_RATIO);
  const timeline = buildUnifiedChatTimeline(vm.messages, vm.nixes, vm.locale);
  const isEmpty = vm.messages.length === 0 && vm.nixes.length === 0;
  const listRef = useRef<FlashListRef<ChatTimelineItem<UnifiedChatTextMessage>>>(null);
  const listBottomInset = COMPOSER_CONTENT_HEIGHT + Math.max(bottomContentInset, 10);

  useEffect(() => {
    if (timeline.length === 0) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [timeline.length]);

  const openReportSheet = (message: OptimisticTextMessage) => {
    const reasons = vm.reportReasons;
    const labels = reasons.map((r) => r.label);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [vm.t('common.cancel'), ...labels],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex == null || buttonIndex === 0) return;
          const reason = reasons[buttonIndex - 1];
          if (reason) void vm.handleReportMessage(message, reason.id);
        }
      );
      return;
    }
    Alert.alert(vm.t('chat.reportMessage'), undefined, [
      { text: vm.t('common.cancel'), style: 'cancel' },
      ...reasons.map((reason) => ({
        text: reason.label,
        onPress: () => void vm.handleReportMessage(message, reason.id),
      })),
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.systemBackground }]}>
      <View style={styles.listArea}>
        {vm.messagesLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.label} />
            <Text style={[styles.muted, { color: colors.secondaryLabel }]}>
              {vm.t('common.loading')}
            </Text>
          </View>
        ) : isEmpty ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.secondaryLabel }]}>
              {vm.t('chat.emptyChat')}
            </Text>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={timeline}
            // @ts-expect-error - estimatedItemSize type issue
            estimatedItemSize={56}
            keyExtractor={(item) => item.id}
            getItemType={(item) => item.type}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomInset }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => {
              if (item.type === 'separator') {
                return <DateSeparator label={item.label} />;
              }
              if (item.type === 'nix') {
                return (
                  <NixChip
                    nix={item.nix}
                    maxWidth={bubbleMaxWidth}
                    t={vm.t}
                    onPress={() => vm.handleOpenNix(item.nix)}
                  />
                );
              }
              return (
                <MessageBubble
                  message={item.message}
                  isOwn={item.message.sender_id === vm.currentUserId}
                  maxWidth={bubbleMaxWidth}
                  onReport={() => openReportSheet(item.message)}
                />
              );
            }}
          />
        )}
        <ChatComposer vm={vm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    paddingTop: 8,
  },
  row: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  bubbleAnchor: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
  },
  bubbleIncoming: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: BUBBLE_CORNER_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleText: {
    ...typography.body,
    textAlign: 'left',
  },
  chipTitle: {
    ...typography.footnote,
    fontWeight: '600',
    textAlign: 'left',
  },
  chipStatus: {
    ...typography.caption,
    textAlign: 'left',
    marginTop: 2,
  },
  sendingSpinner: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  separatorRow: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  separatorText: {
    ...typography.caption,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  muted: {
    ...typography.footnote,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  composerShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  composerEdgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputGlass: {
    flex: 1,
    height: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    justifyContent: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  inputText: {
    ...typography.body,
    padding: 0,
    margin: 0,
  },
  sendGlass: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  footerText: {
    ...typography.caption,
    flex: 1,
    opacity: 0.72,
  },
  footerCounter: {
    ...typography.caption,
    fontWeight: '500',
    opacity: 0.72,
  },
});
