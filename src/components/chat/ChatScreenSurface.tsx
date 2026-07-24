import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import Animated, {
  FadeIn,
  ZoomIn,
  ZoomOut,
  Easing,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { ChatScreenViewModel, OptimisticTextMessage } from '../../hooks/useChatScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useScreenInsets } from '../../hooks/useScreenInsets';
import { selection } from '../../lib/haptics';
import { buildUnifiedChatTimeline, type ChatTimelineItem, type UnifiedChatTextMessage } from '../../lib/chatTimeline';
import {
  MESSAGE_REACTION_EMOJIS,
  MESSAGE_REACTION_GLYPHS,
} from '../../services/messageReactionService';
import type { ChatNixEvent } from '../../services/nixService';
import type { MessageReaction, MessageReactionEmoji } from '../../types/database.types';
import { APP_ICON_SIZE, resolveAppIconName } from '../../theme/app-icons';
import { appleUiSpring, duration, useMotionEnabled } from '../../theme/motion';
import { STACK_NAV_BAR_HEIGHT } from '../../theme/safeArea';
import { typography } from '../../theme/typography';
import { PressableScale } from '../ui/pressable-scale';

type ChatScreenSurfaceProps = {
  vm: ChatScreenViewModel;
};

export type ChatComposerProps = {
  vm: ChatScreenViewModel;
  keyboardHeight: SharedValue<number>;
  restingPad: number;
};

type BubbleWindowLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ReactionPickerState = {
  messageId: string;
  isOwn: boolean;
  /** Pozycja względem root czatu (nie window). */
  x: number;
  y: number;
  width: number;
  height: number;
  rootWidth: number;
};

const BUBBLE_CORNER_RADIUS = 18;
const BUBBLE_MAX_WIDTH_RATIO = 0.72;
const COMPOSER_CONTROL_SIZE = 44;
const COMPOSER_CONTENT_HEIGHT = 78;
/** Minimalny pad composera przy otwartej klawiaturze (nad klawiaturą). */
const COMPOSER_KEYBOARD_PAD = 8;
/** Soft scroll-edge fade nad composerem (zamiast Stack.Toolbar). */
const COMPOSER_EDGE_FADE_EXTRA = 28;

/**
 * Wspólne, zaokrąglone metryki klawiatury — margin listy i pad composera
 * muszą pochodzić z tych samych liczb (inaczej ~1–2 px skoku na końcu).
 *
 * - marginBottom = kb → kurczy box z absolute composerem nad klawiaturą
 *   (paddingBottom rodzica NIE rusza absolute children w RN)
 * - composerPad = inset - kb → safe-area w spoczynku, 8 px nad klawiaturą
 */
function chatKeyboardMetrics(keyboardHeight: number, restingPad: number) {
  'worklet';
  const kb = Math.round(Math.max(0, keyboardHeight));
  const rest = Math.round(restingPad);
  const inset = Math.max(rest, kb + COMPOSER_KEYBOARD_PAD);
  return {
    marginBottom: kb,
    composerPad: inset - kb,
    lift: inset - rest,
  };
}
const REACTION_BADGE_SIZE = 28;
/** Ile miejsca nad dymkiem rezerwujemy na badge (żeby nie nachodził na poprzednią wiadomość). */
const REACTION_BADGE_OVERHANG = Math.ceil(REACTION_BADGE_SIZE * 0.55);
/** Wysunięcie badge poza róg dymka (~połowa średnicy — jak Tapback w iMessage). */
const REACTION_BADGE_CORNER_OUTSET = Math.round(REACTION_BADGE_SIZE * 0.42);
const REACTION_BAR_HEIGHT = 56;
const REACTION_EMOJI_HIT = 48;
const REACTION_BAR_GAP = 8;
const REACTION_BAR_SIDE_INSET = 16;
/** Przesunięcie dymka w dół gdy otwarty pasek (jak fokus w iMessage). */
const BUBBLE_FOCUS_SHIFT = 20;

function estimateReactionBarWidth(showReport: boolean, showTrash: boolean): number {
  const extra = (showReport ? 1 : 0) + (showTrash ? 1 : 0);
  const emojiCount = MESSAGE_REACTION_EMOJIS.length + extra;
  return emojiCount * REACTION_EMOJI_HIT + 16;
}

/** Środek dymka, clamp do safe insetów — pasek nigdy nie wychodzi poza root. */
function layoutReactionPickerBar(params: {
  bubbleX: number;
  bubbleWidth: number;
  rootWidth: number;
  showReport: boolean;
  showTrash: boolean;
}): { left: number; barWidth: number } {
  const { bubbleX, bubbleWidth, rootWidth, showReport, showTrash } = params;
  const inset = REACTION_BAR_SIDE_INSET;
  const available = Math.max(REACTION_EMOJI_HIT * 3, rootWidth - inset * 2);
  const barWidth = Math.min(estimateReactionBarWidth(showReport, showTrash), available);
  const bubbleCenterX = bubbleX + bubbleWidth / 2;
  const preferredLeft = bubbleCenterX - barWidth / 2;
  const left = Math.min(Math.max(inset, preferredLeft), rootWidth - inset - barWidth);
  return { left, barWidth };
}

function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

function ReactionBadges({
  reactions,
  isOwnMessage,
  currentUserId,
  ownReactionBg,
  peerReactionBg,
  onPressBadge,
}: {
  reactions: readonly MessageReaction[];
  isOwnMessage: boolean;
  currentUserId: string;
  ownReactionBg: string;
  peerReactionBg: string;
  onPressBadge: () => void;
}) {
  const motionEnabled = useMotionEnabled();
  if (reactions.length === 0) return null;

  const badgeEntering = motionEnabled
    ? ZoomIn.springify()
        .damping(appleUiSpring.damping)
        .stiffness(appleUiSpring.stiffness)
        .mass(appleUiSpring.mass)
    : undefined;
  const badgeExiting = motionEnabled
    ? ZoomOut.springify()
        .damping(appleUiSpring.damping)
        .stiffness(appleUiSpring.stiffness)
        .mass(appleUiSpring.mass)
    : undefined;

  return (
    <View
      style={[
        styles.reactionBadges,
        isOwnMessage ? styles.reactionBadgesOwn : styles.reactionBadgesIncoming,
      ]}>
      {reactions.map((reaction) => {
        const fromCurrentUser = reaction.user_id === currentUserId;
        const badgeBg = fromCurrentUser ? ownReactionBg : peerReactionBg;
        return (
          <Animated.View
            key={reaction.id}
            entering={badgeEntering}
            exiting={badgeExiting}>
            <Pressable
              onPress={() => {
                selection();
                onPressBadge();
              }}
              accessibilityRole="button"
              accessibilityLabel={MESSAGE_REACTION_GLYPHS[reaction.emoji]}
              style={[styles.reactionBadge, { backgroundColor: badgeBg }]}>
              <Text style={styles.reactionBadgeGlyph}>{MESSAGE_REACTION_GLYPHS[reaction.emoji]}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Poziomy pasek emoji (jak Tapback) — GlassView + duże hit-targety. */
function ReactionPickerBar({
  isOwn,
  selectedEmoji,
  reportLabel,
  removeLabel,
  barWidth,
  onSelect,
  onRemove,
  onReport,
}: {
  isOwn: boolean;
  selectedEmoji: MessageReactionEmoji | null;
  reportLabel: string;
  removeLabel: string;
  barWidth: number;
  onSelect: (emoji: MessageReactionEmoji) => void;
  onRemove: () => void;
  onReport: () => void;
}) {
  const { colors } = useAppTheme();
  const useGlass = canUseLiquidGlass();
  const showTrash = selectedEmoji != null;

  const content = (
    <View style={styles.reactionBarContent}>
      {MESSAGE_REACTION_EMOJIS.map((emoji) => {
        const selected = selectedEmoji === emoji;
        return (
          <Pressable
            key={emoji}
            onPress={() => {
              selection();
              onSelect(emoji);
            }}
            accessibilityRole="button"
            accessibilityLabel={MESSAGE_REACTION_GLYPHS[emoji]}
            accessibilityState={{ selected }}
            hitSlop={4}
            style={[
              styles.reactionBarEmojiHit,
              selected ? { backgroundColor: colors.systemFill } : null,
            ]}>
            <Text style={styles.reactionBarEmoji}>{MESSAGE_REACTION_GLYPHS[emoji]}</Text>
          </Pressable>
        );
      })}
      {showTrash ? (
        <Pressable
          onPress={() => {
            selection();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          hitSlop={4}
          style={styles.reactionBarEmojiHit}>
          <SymbolView
            name={resolveAppIconName('trash')}
            size={APP_ICON_SIZE.xl}
            tintColor={colors.destructive}
            weight="medium"
          />
        </Pressable>
      ) : null}
      {!isOwn ? (
        <Pressable
          onPress={() => {
            selection();
            onReport();
          }}
          accessibilityRole="button"
          accessibilityLabel={reportLabel}
          hitSlop={4}
          style={styles.reactionBarEmojiHit}>
          <SymbolView
            name={resolveAppIconName('report')}
            size={APP_ICON_SIZE.xl}
            tintColor={colors.destructive}
            weight="medium"
          />
        </Pressable>
      ) : null}
    </View>
  );

  if (useGlass) {
    return (
      <GlassView
        style={[styles.reactionBar, { width: barWidth }]}
        glassEffectStyle="regular"
        isInteractive>
        {content}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.reactionBar,
        { width: barWidth, backgroundColor: colors.secondarySystemFill },
      ]}>
      {content}
    </View>
  );
}

function MessageBubbleContent({
  message,
  isOwn,
  bubbleBg,
  labelColor,
  reactions,
  currentUserId,
  ownReactionBg,
  peerReactionBg,
  onPressBadge,
}: {
  message: OptimisticTextMessage;
  isOwn: boolean;
  bubbleBg: string;
  labelColor: string;
  reactions: readonly MessageReaction[];
  currentUserId: string;
  ownReactionBg: string;
  peerReactionBg: string;
  onPressBadge: () => void;
}) {
  const hasReactions = reactions.length > 0;
  return (
    <View
      style={[
        styles.bubbleWithReactions,
        hasReactions ? styles.bubbleWithReactionsActive : null,
      ]}>
      <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
        <Text style={[styles.bubbleText, { color: labelColor }]}>{message.body}</Text>
        {message.isSending ? (
          <ActivityIndicator size="small" color={labelColor} style={styles.sendingSpinner} />
        ) : null}
      </View>
      <ReactionBadges
        reactions={reactions}
        isOwnMessage={isOwn}
        currentUserId={currentUserId}
        ownReactionBg={ownReactionBg}
        peerReactionBg={peerReactionBg}
        onPressBadge={onPressBadge}
      />
    </View>
  );
}

function MessageBubble({
  message,
  isOwn,
  maxWidth,
  reactions,
  currentUserId,
  canReact,
  isFocused,
  onOpenPicker,
  onReport,
}: {
  message: OptimisticTextMessage;
  isOwn: boolean;
  maxWidth: number;
  reactions: readonly MessageReaction[];
  currentUserId: string;
  canReact: boolean;
  isFocused: boolean;
  onOpenPicker: (layout: BubbleWindowLayout) => void;
  onReport: () => void;
}) {
  const { colors } = useAppTheme();
  const bubbleRef = useRef<View>(null);
  const bubbleBg = isOwn ? colors.accent : colors.chatBubbleIncoming;
  const labelColor = isOwn ? colors.onChatBubbleOwn : colors.label;
  const ownReactionBg = colors.accent;
  const peerReactionBg = colors.chatBubbleIncoming;
  const hasReactions = reactions.length > 0;
  const focusShift = useSharedValue(0);
  const motionEnabled = useMotionEnabled();
  const isOptimistic = message.id.startsWith('temp-') || Boolean(message.isSending);

  useEffect(() => {
    focusShift.set(withSpring(isFocused ? BUBBLE_FOCUS_SHIFT : 0, appleUiSpring));
  }, [isFocused, focusShift]);

  const focusStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: focusShift.get() }],
  }));

  const openPickerFromBubble = () => {
    if (!canReact) {
      if (!isOwn) onReport();
      return;
    }
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      selection();
      onOpenPicker({ x, y, width, height });
    });
  };

  return (
    <View style={[styles.row, hasReactions ? styles.rowWithReactions : null]}>
      <Animated.View
        entering={
          motionEnabled && isOptimistic ? FadeIn.duration(duration.fast) : undefined
        }
        style={[
          styles.bubbleAnchor,
          isOwn ? styles.bubbleOwn : styles.bubbleIncoming,
          { maxWidth },
          focusStyle,
        ]}>
        <View ref={bubbleRef} collapsable={false}>
          <Pressable
            onLongPress={openPickerFromBubble}
            delayLongPress={350}
            accessibilityRole="button"
            style={styles.bubblePressable}>
            <MessageBubbleContent
              message={message}
              isOwn={isOwn}
              bubbleBg={bubbleBg}
              labelColor={labelColor}
              reactions={reactions}
              currentUserId={currentUserId}
              ownReactionBg={ownReactionBg}
              peerReactionBg={peerReactionBg}
              onPressBadge={openPickerFromBubble}
            />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function ReactionPickerOverlay({
  picker,
  open,
  selectedEmoji,
  reportLabel,
  removeLabel,
  onSelect,
  onRemove,
  onReport,
  onDismiss,
  onExited,
}: {
  picker: ReactionPickerState;
  open: boolean;
  selectedEmoji: MessageReactionEmoji | null;
  reportLabel: string;
  removeLabel: string;
  onSelect: (emoji: MessageReactionEmoji) => void;
  onRemove: () => void;
  onReport: () => void;
  onDismiss: () => void;
  onExited: () => void;
}) {
  const showTrash = selectedEmoji != null;
  const liveLayout = layoutReactionPickerBar({
    bubbleX: picker.x,
    bubbleWidth: picker.width,
    rootWidth: picker.rootWidth,
    showReport: !picker.isOwn,
    showTrash,
  });
  /** Nad dymkiem po uwzględnieniu przesunięcia fokusa. */
  const top = Math.max(
    REACTION_BAR_SIDE_INSET,
    picker.y + BUBBLE_FOCUS_SHIFT - REACTION_BAR_HEIGHT - REACTION_BAR_GAP
  );

  /**
   * Przy wyborze emoji React batchuje: open=false + nowy selectedEmoji (kosz).
   * Bez snapshota pasek zmienia width/left w trakcie close → skok wyglądający jak scale.
   * Aktualizacja snapshota w trakcie renderu gdy open (dozwolony pattern „adjusting state”).
   */
  const [frozenLayout, setFrozenLayout] = useState({
    left: liveLayout.left,
    barWidth: liveLayout.barWidth,
    selectedEmoji,
  });
  if (open) {
    if (
      frozenLayout.left !== liveLayout.left ||
      frozenLayout.barWidth !== liveLayout.barWidth ||
      frozenLayout.selectedEmoji !== selectedEmoji
    ) {
      setFrozenLayout({
        left: liveLayout.left,
        barWidth: liveLayout.barWidth,
        selectedEmoji,
      });
    }
  }
  const { left, barWidth, selectedEmoji: displayEmoji } = open
    ? { left: liveLayout.left, barWidth: liveLayout.barWidth, selectedEmoji }
    : frozenLayout;

  const progress = useSharedValue(0);
  /** 0 = open curve (0.55→1), 1 = close curve (1→0). Bez skoku w momencie startu close. */
  const closing = useSharedValue(0);

  useEffect(() => {
    if (open) {
      closing.set(0);
      progress.set(withSpring(1, appleUiSpring));
      return;
    }
    closing.set(1);
    // Close idzie do scale≈0 (nie do 0.55) — inaczej pasek „stoi” w miniaturze i dopiero unmount.
    progress.set(
      withTiming(0, { duration: duration.medium, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(onExited)();
        }
      })
    );
  }, [open, onExited, progress, closing]);

  /**
   * Bez opacity na przodku GlassView (Known issue expo-glass-effect).
   * Open: 0.55→1. Close: 1→0 (ten sam progress=1 na styku, bez skoku).
   */
  const barStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, progress.get()));
    const scale = closing.get() === 1 ? p : 0.55 + p * 0.45;
    return {
      transform: [
        { scale },
        { translateY: (1 - p) * 14 },
      ],
    };
  });

  return (
    <View style={styles.pickerOverlay} pointerEvents="box-none">
      <Pressable
        style={styles.pickerBackdrop}
        onPress={onDismiss}
        accessibilityLabel="Zamknij reakcje"
      />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.reactionBarOverlay, { top, left, width: barWidth }, barStyle]}>
        <ReactionPickerBar
          isOwn={picker.isOwn}
          selectedEmoji={displayEmoji}
          reportLabel={reportLabel}
          removeLabel={removeLabel}
          barWidth={barWidth}
          onSelect={onSelect}
          onRemove={onRemove}
          onReport={onReport}
        />
      </Animated.View>
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
 * Overlay nad FlashList — `GlassView` sampluje bąbelki pod spodem.
 * Rodzic: marginBottom = kb. Tu: paddingBottom = safe-area / min. pad nad KB.
 */
function ChatComposer({ vm, keyboardHeight, restingPad }: ChatComposerProps) {
  const { colors } = useAppTheme();
  const canSend = Boolean(vm.inputBody.trim()) && !vm.sending;
  const useGlass = canUseLiquidGlass();

  const composerStyle = useAnimatedStyle(() => {
    const { composerPad } = chatKeyboardMetrics(keyboardHeight.value, restingPad);
    return {
      bottom: 0,
      paddingBottom: composerPad,
    };
  });

  const edgeFadeStyle = useAnimatedStyle(() => {
    const { composerPad } = chatKeyboardMetrics(keyboardHeight.value, restingPad);
    return {
      height: COMPOSER_CONTENT_HEIGHT + composerPad + COMPOSER_EDGE_FADE_EXTRA,
    };
  });

  const fallbackFill = { backgroundColor: colors.secondarySystemFill };
  /**
   * Jak scroll-edge pod headerem: tylko miękki fade do systemBackground.
   * BlurView tu zbierał kolor bąbelków (fioletowy „glow”) — nie jak u góry.
   */
  const bg = colors.systemBackground.length >= 7 ? colors.systemBackground.slice(0, 7) : colors.systemBackground;

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

  const sendControl = useGlass ? (
    <GlassView style={styles.sendGlass} glassEffectStyle="regular" isInteractive>
      <SymbolView
        name={resolveAppIconName('send')}
        size={APP_ICON_SIZE.md}
        tintColor={colors.accent}
        weight="semibold"
        style={{ opacity: canSend ? 1 : 0.4 }}
      />
    </GlassView>
  ) : (
    <View style={[styles.sendGlass, fallbackFill, { opacity: canSend ? 1 : 0.4 }]}>
      <SymbolView
        name={resolveAppIconName('send')}
        size={APP_ICON_SIZE.md}
        tintColor={colors.accent}
        weight="semibold"
      />
    </View>
  );

  return (
    <Animated.View pointerEvents="box-none" style={[styles.composerShell, composerStyle]}>
      <Animated.View pointerEvents="none" style={[styles.composerEdgeFade, edgeFadeStyle]}>
        <LinearGradient
          colors={[`${bg}00`, `${bg}D9`, `${bg}FF`]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.composerRow}>
        {useGlass ? (
          <GlassView style={styles.inputGlass} glassEffectStyle="regular" isInteractive>
            {inputField}
          </GlassView>
        ) : (
          <View style={[styles.inputGlass, fallbackFill]}>{inputField}</View>
        )}

        <PressableScale
          onPress={() => void vm.handleSend()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={vm.t('chat.send')}
          accessibilityState={{ disabled: !canSend }}>
          {sendControl}
        </PressableScale>
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.label }]} numberOfLines={2}>
          {vm.t('chat.disappearsFooter')}
        </Text>
        <Text style={[styles.footerCounter, { color: colors.label }]}>
          {`${vm.inputBody.length}/2000`}
        </Text>
      </View>
    </Animated.View>
  );
}

export function ChatScreenSurface({ vm }: ChatScreenSurfaceProps) {
  const { colors } = useAppTheme();
  const { top, bottomContentInset } = useScreenInsets('stackHeader');
  const { width: windowWidth } = useWindowDimensions();
  const bubbleMaxWidth = Math.round(windowWidth * BUBBLE_MAX_WIDTH_RATIO);
  const timeline = buildUnifiedChatTimeline(vm.messages, vm.nixes, vm.locale);
  const isEmpty = vm.messages.length === 0 && vm.nixes.length === 0;
  const listRef = useRef<FlashListRef<ChatTimelineItem<UnifiedChatTextMessage>>>(null);
  const rootRef = useRef<View>(null);
  const scrollOffsetRef = useRef(0);
  const restingPad = Math.max(bottomContentInset, 10);
  const listTopInset = top + STACK_NAV_BAR_HEIGHT + 8;
  const listBottomInset = COMPOSER_CONTENT_HEIGHT + restingPad + COMPOSER_EDGE_FADE_EXTRA;
  const keyboard = useAnimatedKeyboard();
  const [picker, setPicker] = useState<ReactionPickerState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const listAreaStyle = useAnimatedStyle(() => {
    const { marginBottom } = chatKeyboardMetrics(keyboard.height.value, restingPad);
    return { marginBottom };
  });

  /**
   * Offset listy w momencie startu unoszenia composera.
   * Scroll = base + lift z tych samych zaokrąglonych metryk co layout.
   */
  const scrollBaseRef = useRef<number | null>(null);

  const applyKeyboardScroll = (keyboardHeight: number) => {
    const { lift } = chatKeyboardMetrics(keyboardHeight, restingPad);

    if (keyboardHeight < 0.5) {
      scrollBaseRef.current = null;
      return;
    }

    if (lift <= 0) return;

    if (scrollBaseRef.current == null) {
      scrollBaseRef.current = scrollOffsetRef.current;
    }

    const target = Math.max(0, scrollBaseRef.current + lift);
    if (Math.abs(target - scrollOffsetRef.current) < 0.1) return;
    scrollOffsetRef.current = target;
    listRef.current?.scrollToOffset({ offset: target, animated: false });
  };

  useAnimatedReaction(
    () => keyboard.height.value,
    (current, previous) => {
      if (previous == null && current < 0.5) return;
      runOnJS(applyKeyboardScroll)(current);
    }
  );

  useEffect(() => {
    if (timeline.length === 0) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [timeline.length]);

  const onListScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  };

  const requestClosePicker = () => {
    setPickerOpen(false);
  };

  const finishClosePicker = () => {
    setPicker(null);
    setPickerOpen(false);
  };

  const openPickerForMessage = (
    message: OptimisticTextMessage,
    isOwn: boolean,
    layout: BubbleWindowLayout
  ) => {
    rootRef.current?.measureInWindow((rootX, rootY, rootW) => {
      const rootWidth = rootW > 0 ? rootW : layout.width;
      setPicker({
        messageId: message.id,
        isOwn,
        x: layout.x - rootX,
        y: layout.y - rootY,
        width: layout.width,
        height: layout.height,
        rootWidth,
      });
      setPickerOpen(true);
    });
  };

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

  const pickerMessage = picker
    ? vm.messages.find((message) => message.id === picker.messageId) ?? null
    : null;
  const pickerSelectedEmoji =
    picker && pickerMessage
      ? (vm.reactionsByMessageId.get(picker.messageId) ?? []).find(
          (reaction) => reaction.user_id === vm.currentUserId
        )?.emoji ?? null
      : null;

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={[styles.root, { backgroundColor: colors.systemBackground }]}>
      <Animated.View style={[styles.listArea, listAreaStyle]}>
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
            // Manual padding compensates for headerTransparent + absolute composer.
            // contentInset is unreliable on FlashList (messages slide under the bar).
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={[
              styles.listContent,
              { paddingTop: listTopInset, paddingBottom: listBottomInset },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={onListScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={requestClosePicker}
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
                    onPress={() => {
                      requestClosePicker();
                      vm.handleOpenNix(item.nix);
                    }}
                  />
                );
              }
              const isOwn = item.message.sender_id === vm.currentUserId;
              const canReact = !item.message.id.startsWith('temp-') && !item.message.isSending;
              return (
                <MessageBubble
                  message={item.message}
                  isOwn={isOwn}
                  maxWidth={bubbleMaxWidth}
                  reactions={vm.reactionsByMessageId.get(item.message.id) ?? []}
                  currentUserId={vm.currentUserId}
                  canReact={canReact}
                  isFocused={pickerOpen && picker?.messageId === item.message.id}
                  onOpenPicker={(layout) => openPickerForMessage(item.message, isOwn, layout)}
                  onReport={() => openReportSheet(item.message)}
                />
              );
            }}
          />
        )}
        <ChatComposer vm={vm} keyboardHeight={keyboard.height} restingPad={restingPad} />
      </Animated.View>

      {picker && pickerMessage ? (
        <ReactionPickerOverlay
          picker={picker}
          open={pickerOpen}
          selectedEmoji={pickerSelectedEmoji}
          reportLabel={vm.t('chat.reportMessage')}
          removeLabel={vm.t('chat.removeReaction')}
          onDismiss={requestClosePicker}
          onExited={finishClosePicker}
          onSelect={(emoji) => {
            void vm.handleSetReaction(pickerMessage, emoji);
            requestClosePicker();
          }}
          onRemove={() => {
            void vm.handleRemoveReaction(pickerMessage);
            requestClosePicker();
          }}
          onReport={() => {
            requestClosePicker();
            openReportSheet(pickerMessage);
          }}
        />
      ) : null}
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
    flexGrow: 1,
  },
  row: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  rowWithReactions: {
    paddingTop: 6,
    paddingBottom: 10,
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
  bubblePressable: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bubbleWithReactions: {
    position: 'relative',
  },
  bubbleWithReactionsActive: {
    paddingTop: REACTION_BADGE_OVERHANG,
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
  pickerOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  reactionBarOverlay: {
    position: 'absolute',
    height: REACTION_BAR_HEIGHT,
    zIndex: 21,
    borderRadius: REACTION_BAR_HEIGHT / 2,
  },
  reactionBar: {
    height: REACTION_BAR_HEIGHT,
    borderRadius: REACTION_BAR_HEIGHT / 2,
    justifyContent: 'center',
  },
  reactionBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    height: REACTION_BAR_HEIGHT,
  },
  reactionBarEmojiHit: {
    width: REACTION_EMOJI_HIT,
    height: REACTION_EMOJI_HIT,
    borderRadius: REACTION_EMOJI_HIT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBarEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  reactionBarReportHit: {
    width: REACTION_EMOJI_HIT,
    height: REACTION_EMOJI_HIT,
    borderRadius: REACTION_EMOJI_HIT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBadges: {
    position: 'absolute',
    top: 0,
    flexDirection: 'row',
    gap: 2,
    zIndex: 1,
  },
  reactionBadgesOwn: {
    left: -REACTION_BADGE_CORNER_OUTSET,
  },
  reactionBadgesIncoming: {
    right: -REACTION_BADGE_CORNER_OUTSET,
  },
  reactionBadge: {
    minWidth: REACTION_BADGE_SIZE,
    height: REACTION_BADGE_SIZE,
    borderRadius: REACTION_BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  reactionBadgeGlyph: {
    fontSize: 14,
    lineHeight: 18,
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
    bottom: 0,
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
