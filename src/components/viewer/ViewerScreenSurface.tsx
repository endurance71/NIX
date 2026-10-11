import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { ViewerReactionPop, type ViewerReactionPopState } from './ViewerReactionPop';
import { useViewerScreen, type ViewerScreenViewModel } from '../../hooks/useViewerScreen';
import { useStableHandler } from '../../hooks/useStableHandler';
import { ViewerNixVideo } from './ViewerNixVideo';
import { ViewerSegmentTimerHud } from './ViewerSegmentTimerHud';
import { ViewerReplyField, type ViewerReplyFieldRef } from './ViewerReplyField';
import { ViewerEmojiRow } from './ViewerEmojiRow';
import { useViewerGestures } from './useViewerGestures';
import { VIEWER_AVATAR_SIZE, VIEWER_CHROME_BUTTON_SIZE } from './viewerScreen.styles';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { NativeGlassPill } from '../ui/native-glass-pill';
import { NativeMediaActions } from '../ui/native-media-actions';
import { AvatarCircle } from '../ui/avatar-circle';
import { mediaContentFit } from '../../lib/mediaPresentation';
import { selection } from '../../lib/haptics';
import type { MessageReactionEmoji } from '../../types/database.types';
import type { ViewerTapZone } from '../../lib/viewerGestures';
import { TEXT_MESSAGE_MAX_LENGTH } from '../../services/textMessageService';
import { MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { duration, useMotionEnabled } from '../../theme/motion';

/** Fast loads never flash a spinner. */
const VIEWER_SPINNER_DELAY_MS = 300;
const HUD_TOP_GAP = 8;
const HEADER_TOP_GAP = 18;
const TOP_SCRIM_EXTRA = 96;
const BOTTOM_SCRIM_EXTRA = 120;

type MeasuredImage = { uri: string | null; width?: number; height?: number };
type ReadyFrame = { uri: string; slideIndex: number; fit: 'contain' | 'cover' };

function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [active, delayMs]);
  return active && shown;
}

function ViewerSpinner({ vm, active }: { vm: ViewerScreenViewModel; active: boolean }) {
  const { t } = useTranslation();
  const visible = useDelayedFlag(active, VIEWER_SPINNER_DELAY_MS);
  if (!visible) return null;
  return (
    <View style={vm.styles.loadingOverlay} pointerEvents="none">
      <ActivityIndicator color={vm.colors.cameraControlTint} accessibilityLabel={t('viewer.loading')} />
    </View>
  );
}

/**
 * PERF-20: the embedded/generated poster stays over the VideoView until its first frame renders,
 * so the signed URL → readyToPlay gap is never a black frame. One stable layer for both phases.
 */
function ViewerVideoSlide({ vm }: { vm: ViewerScreenViewModel }) {
  const [firstFrameKey, setFirstFrameKey] = useState<string | null>(null);
  const nix = vm.displayedNix;
  const videoKey = nix && vm.imageUrl ? `${nix.id}-${vm.imageUrl}` : null;
  const posterSource = vm.videoThumbnailOverlay ?? (vm.videoPosterUri ? { uri: vm.videoPosterUri } : null);
  const showPoster = Boolean(posterSource) && (videoKey === null || firstFrameKey !== videoKey);
  return (
    <View style={vm.styles.imageContainer}>
      {nix && vm.imageUrl && videoKey ? (
        <ViewerNixVideo
          key={videoKey}
          uri={vm.imageUrl}
          player={vm.videoPlayer}
          onReady={vm.onVideoReady}
          onError={vm.onVideoError}
          onPlayToEnd={vm.finishCurrentSlide}
          onFirstFrame={() => setFirstFrameKey(videoKey)}
          progress={vm.segmentProgress}
          paused={vm.playbackPaused}
          loop={vm.videoLoop}
          muted={!vm.soundOn}
          restartKey={vm.restartKey}
          style={vm.styles.image}
        />
      ) : null}
      {showPoster && posterSource ? (
        <View style={vm.styles.videoPosterLayer} pointerEvents="none">
          <ExpoImage
            source={posterSource}
            style={vm.styles.image}
            contentFit="cover"
            cachePolicy="memory"
          />
        </View>
      ) : null}
    </View>
  );
}

function ViewerPhotoSlide({ vm, motionEnabled }: { vm: ViewerScreenViewModel; motionEnabled: boolean }) {
  const [measuredImage, setMeasuredImage] = useState<MeasuredImage>({ uri: null });
  // The previous photo stays under the next one until it is ready: no black frame between slides.
  const [lastReady, setLastReady] = useState<ReadyFrame | null>(null);
  const imageDimensions = measuredImage.uri === vm.imageUrl ? measuredImage : {};
  const imageFit = mediaContentFit(imageDimensions);
  const heldUri =
    !vm.imageReady &&
    !vm.viewerError &&
    lastReady &&
    lastReady.uri !== vm.imageUrl &&
    lastReady.slideIndex === vm.slideIndex - 1
      ? lastReady.uri
      : null;

  const markReady = (uri: string, event: { source: { width: number; height: number } }) => {
    const { width, height } = event.source;
    setMeasuredImage({ uri, width, height });
    setLastReady({ uri, slideIndex: vm.slideIndex, fit: mediaContentFit({ width, height }) });
  };

  // One keyed list, so the current image survives as the held frame without reloading.
  const frames: { uri: string; held: boolean }[] = [];
  if (heldUri) frames.push({ uri: heldUri, held: true });
  if (vm.imageUrl) frames.push({ uri: vm.imageUrl, held: false });
  if (frames.length === 0) return null;

  return (
    <View style={vm.styles.imageContainer}>
      {frames.map(({ uri, held }) => {
        if (held) {
          // Same element type and key as when it was current, so React keeps the decoded image.
          return (
            <ExpoImage
              key={uri}
              source={{ uri }}
              style={vm.styles.heldFrame}
              contentFit={lastReady?.fit ?? 'cover'}
              cachePolicy="none"
            />
          );
        }
        return vm.useNativeFallback ? (
          <ExpoImage
            key={`${uri}-fallback`}
            source={{ uri }}
            cachePolicy="none"
            style={vm.styles.heldFrame}
            contentFit={imageFit}
            onLoad={(event) => {
              markReady(uri, event);
              vm.onFallbackImageLoad();
            }}
            onError={vm.onFallbackImageError}
          />
        ) : (
          <ExpoImage
            key={uri}
            source={{ uri }}
            style={vm.styles.heldFrame}
            contentFit={imageFit}
            // Over a held frame the swap is instant; from black it fades in.
            transition={motionEnabled && !heldUri ? duration.fast : 0}
            cachePolicy="none"
            onLoad={(event) => {
              markReady(uri, event);
              vm.onPrimaryImageLoad();
            }}
            onError={vm.onPrimaryImageError}
          />
        );
      })}
    </View>
  );
}

function ViewerMedia({ vm, motionEnabled }: { vm: ViewerScreenViewModel; motionEnabled: boolean }) {
  const isVideo = (vm.displayedNix ?? vm.currentNix)?.media_type === 'video';
  return isVideo ? <ViewerVideoSlide vm={vm} /> : <ViewerPhotoSlide vm={vm} motionEnabled={motionEnabled} />;
}

function ViewerErrorOverlay({ vm }: { vm: ViewerScreenViewModel }) {
  const { t } = useTranslation();
  if (!vm.viewerError) return null;
  const actions = [
    ...(vm.viewerError.kind === 'transient'
      ? [{ key: 'retry', label: t('common.retry'), accessibilityLabel: t('common.retry'), onPress: vm.retryViewer }]
      : []),
    ...(vm.viewerError.kind === 'permanentMissing' && vm.currentNix
      ? [
          {
            key: 'skip',
            label: t('viewer.skip'),
            accessibilityLabel: t('viewer.skipUnavailable'),
            onPress: vm.skipUnavailable,
          },
        ]
      : []),
    {
      key: 'back',
      label: t('viewer.back'),
      accessibilityLabel: t('viewer.back'),
      onPress: () => vm.leaveViewer('explicit_back'),
    },
  ];
  return (
    <View style={vm.styles.errorOverlay} accessibilityViewIsModal>
      <Text style={vm.styles.errorText} selectable accessibilityRole="alert">
        {vm.viewerError.message}
      </Text>
      <NativeMediaActions actions={actions} tintColor={vm.colors.cameraControlTint} />
    </View>
  );
}

function ViewerHeader({ vm }: { vm: ViewerScreenViewModel }) {
  const { t } = useTranslation();
  const sender = vm.sender;
  const top = vm.insets.top + (vm.queue.length > 1 ? HEADER_TOP_GAP : HUD_TOP_GAP);
  const senderA11y = [sender?.name, sender?.timeLabel, vm.isReplay ? t('viewer.replay') : null]
    .filter(Boolean)
    .join(', ');
  const chromeButton = {
    size: VIEWER_CHROME_BUTTON_SIZE,
    iconSize: APP_ICON_SIZE.lg,
    backgroundColor: vm.colors.cameraControlBackground,
    tintColor: vm.colors.cameraControlTint,
  };
  return (
    <View style={[vm.styles.header, { top }]} pointerEvents="box-none">
      <View
        style={vm.styles.senderInfo}
        accessible={Boolean(senderA11y)}
        accessibilityLabel={senderA11y || undefined}
        accessibilityRole="header">
        {sender ? (
          <AvatarCircle
            size={VIEWER_AVATAR_SIZE}
            url={sender.avatarUrl}
            storagePath={sender.avatarPath}
            emoji={sender.avatarEmoji}
            fallbackInitial={sender.fallbackInitial}
          />
        ) : null}
        <View style={vm.styles.senderText}>
          {sender?.name ? (
            <Text
              style={vm.styles.senderName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}>
              {sender.name}
            </Text>
          ) : null}
          {sender?.timeLabel ? (
            <Text style={vm.styles.senderTime} numberOfLines={1}>
              {sender.timeLabel}
            </Text>
          ) : null}
        </View>
        {vm.isReplay ? (
          // Spoken through the header's combined label.
          <NativeGlassPill
            label={t('viewer.replay')}
            tintColor={vm.colors.cameraControlTint}
            fill={vm.colors.viewerChromeFill}
            textStyle="caption"
            size="compact"
            accessibilityHidden
          />
        ) : null}
      </View>
      <View style={vm.styles.headerButtons}>
        {vm.isVideoSlide ? (
          <NativeChromeIconButton
            {...chromeButton}
            name={vm.soundOn ? 'speakerOn' : 'speakerOff'}
            accessibilityLabel={vm.soundOn ? t('viewer.soundOff') : t('viewer.soundOn')}
            onPress={vm.toggleSound}
          />
        ) : null}
        {vm.safetyAvailable ? (
          <NativeChromeIconButton
            {...chromeButton}
            name="more"
            accessibilityLabel={t('viewer.moreA11y')}
            onPress={vm.openSafetyMenu}
            disabled={vm.safetyBusy}
          />
        ) : null}
        <NativeChromeIconButton
          {...chromeButton}
          name="close"
          accessibilityLabel={t('viewer.close')}
          onPress={() => vm.leaveViewer('close_button')}
        />
      </View>
    </View>
  );
}

function ViewerBottomBar({
  vm,
  onReacted,
}: {
  vm: ViewerScreenViewModel;
  onReacted: (emoji: MessageReactionEmoji) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<ViewerReplyFieldRef>(null);
  const [sending, setSending] = useState(false);
  // Return and the emoji row can fire in the same frame; React state would let both through.
  const sendingRef = useRef(false);
  const keyboard = useAnimatedKeyboard();
  const bottomInset = vm.insets.bottom;
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.get() - bottomInset) }],
  }));
  const showSave = vm.canSaveToGallery && Boolean(vm.imageUrl) && !vm.imageLoadError;
  if (!vm.canReply && !showSave) return null;

  // Back to the NiX: the keyboard closes and playback resumes.
  const backToNix = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const send = (body: string) => {
    if (sendingRef.current || !body.trim()) return;
    sendingRef.current = true;
    setSending(true);
    void vm
      .sendReply(body)
      .then((sent) => {
        if (!sent) return;
        inputRef.current?.clear();
        backToNix();
      })
      .finally(() => {
        sendingRef.current = false;
        setSending(false);
      });
  };

  const react = (emoji: MessageReactionEmoji) => {
    if (sendingRef.current) return;
    const glyph = MESSAGE_REACTION_GLYPHS[emoji];
    const removing = vm.nixReaction === emoji;
    selection();
    // Confirmation right away (the write is optimistic); a typed draft stays in the field.
    if (!removing) onReacted(emoji);
    backToNix();
    sendingRef.current = true;
    setSending(true);
    void vm
      .reactToNix(emoji)
      .then((outcome) => {
        if (outcome.status === 'added' || outcome.status === 'updated') {
          AccessibilityInfo.announceForAccessibility(t('viewer.nixReactionSet', { emoji: glyph }));
        } else if (outcome.status === 'removed') {
          AccessibilityInfo.announceForAccessibility(t('viewer.nixReactionRemoved'));
        }
      })
      .finally(() => {
        sendingRef.current = false;
        setSending(false);
      });
  };

  const ownReaction =
    vm.emojiMode === 'reaction' && vm.nixReaction && !vm.replyFocused
      ? {
          glyph: MESSAGE_REACTION_GLYPHS[vm.nixReaction],
          accessibilityLabel: t('viewer.nixReactionOwnA11y', {
            emoji: MESSAGE_REACTION_GLYPHS[vm.nixReaction],
          }),
          onPress: () => inputRef.current?.focus(),
        }
      : null;

  return (
    <Animated.View style={[vm.styles.bottomBar, { bottom: bottomInset + 12 }, liftStyle]}>
      {vm.canReply && vm.replyFocused ? (
        <ViewerEmojiRow
          mode={vm.emojiMode}
          selected={vm.nixReaction}
          disabled={sending}
          onPick={(emoji) =>
            vm.emojiMode === 'reaction' ? react(emoji) : send(MESSAGE_REACTION_GLYPHS[emoji])
          }
          fill={vm.colors.cameraControlBackground}
          selectedFill={vm.colors.accent}
        />
      ) : null}
      <View style={vm.styles.bottomRow}>
        {vm.canReply ? (
          <ViewerReplyField
            ref={inputRef}
            placeholder={t('viewer.replyPlaceholder')}
            accessibilityLabel={t('viewer.replyA11y')}
            maxLength={TEXT_MESSAGE_MAX_LENGTH}
            editable={!sending}
            onSubmit={send}
            onFocusChange={vm.setReplyFocused}
            trailing={ownReaction}
            textColor={vm.colors.cameraControlTint}
            placeholderColor={vm.colors.cinemaSecondaryLabel}
            fill={vm.colors.cameraControlBackground}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {vm.canReply ? (
          <NativeChromeIconButton
            name="cameraFill"
            accessibilityLabel={t('viewer.replyWithNix')}
            onPress={vm.replyWithNix}
            disabled={vm.closing}
            size={VIEWER_CHROME_BUTTON_SIZE}
            iconSize={APP_ICON_SIZE.lg}
            backgroundColor={vm.colors.cameraControlBackground}
            tintColor={vm.colors.cameraControlTint}
          />
        ) : null}
        {showSave ? (
          <NativeChromeIconButton
            name="saveToPhotos"
            accessibilityLabel={vm.saveToGalleryA11y}
            onPress={vm.saveToGallery}
            busy={vm.isSavingToGallery}
            disabled={vm.closing || !vm.imageReady}
            size={VIEWER_CHROME_BUTTON_SIZE}
            iconSize={APP_ICON_SIZE.lg}
            backgroundColor={vm.colors.cameraControlBackground}
            tintColor={vm.colors.cameraControlTint}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

type A11yActionName =
  | 'activate'
  | 'next'
  | 'togglePause'
  | 'restart'
  | 'report'
  | 'save'
  | 'sound'
  | 'replyWithNix'
  | 'close';

export function ViewerScreenSurface() {
  const { t } = useTranslation();
  const vm = useViewerScreen();
  const motionEnabled = useMotionEnabled();
  const { width, height } = useWindowDimensions();
  const [reactionPop, setReactionPop] = useState<ViewerReactionPopState | null>(null);
  const showReactionPop = (emoji: MessageReactionEmoji) =>
    setReactionPop((current) => ({ emoji, key: (current?.key ?? 0) + 1 }));

  const onTapZone = useStableHandler((zone: ViewerTapZone) => {
    if (vm.replyFocused) {
      // A tap on the media while typing only closes the keyboard.
      Keyboard.dismiss();
      return;
    }
    if (zone === 'back') {
      selection();
      vm.restartCurrentSlide();
      return;
    }
    if (!vm.canDismissByTap) return;
    vm.handleNextTap();
  });
  const onHoldChange = useStableHandler((held: boolean) => vm.setUserPaused(held));
  const onDismiss = useStableHandler(() => vm.leaveViewer('swipe_down'));

  const mediaVisible = vm.imageReady && !vm.imageLoadError;
  const { gesture, stageStyle, backdropStyle, chromeStyle } = useViewerGestures({
    width,
    height,
    motionEnabled,
    tapEnabled: mediaVisible && !vm.closing,
    panEnabled: !vm.closing && !vm.replyFocused,
    onTapZone,
    onHoldChange,
    onDismiss,
  });

  if (vm.isBootLoading) {
    return (
      <View style={vm.styles.bootContainer}>
        <StatusBar style="light" hidden={false} />
        <ViewerSpinner vm={vm} active />
      </View>
    );
  }

  const isLastSlide = vm.slideIndex >= vm.queue.length - 1;
  const a11yActions: { name: A11yActionName; label: string }[] = [
    { name: 'activate', label: isLastSlide ? t('viewer.close') : t('viewer.nextSegment') },
    { name: 'next', label: isLastSlide ? t('viewer.close') : t('viewer.nextSegment') },
    { name: 'togglePause', label: vm.userPaused ? t('viewer.resume') : t('viewer.pause') },
    { name: 'restart', label: t('viewer.restartSlide') },
    ...(vm.isVideoSlide
      ? [{ name: 'sound' as const, label: vm.soundOn ? t('viewer.soundOff') : t('viewer.soundOn') }]
      : []),
    ...(vm.safetyAvailable ? [{ name: 'report' as const, label: t('viewer.reportAction') }] : []),
    ...(vm.canSaveToGallery && mediaVisible
      ? [{ name: 'save' as const, label: vm.saveToGalleryA11y }]
      : []),
    ...(vm.canReply ? [{ name: 'replyWithNix' as const, label: t('viewer.replyWithNix') }] : []),
    { name: 'close', label: t('viewer.close') },
  ];
  const togglePause = () => {
    const next = !vm.userPaused;
    vm.setUserPaused(next);
    AccessibilityInfo.announceForAccessibility(next ? t('viewer.paused') : t('viewer.resume'));
  };
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName as A11yActionName) {
      case 'activate':
      case 'next':
        if (mediaVisible) vm.handleNextTap();
        return;
      case 'togglePause':
        togglePause();
        return;
      case 'restart':
        vm.restartCurrentSlide();
        return;
      case 'sound':
        vm.toggleSound();
        return;
      case 'report':
        vm.openSafetyMenu();
        return;
      case 'save':
        vm.saveToGallery();
        return;
      case 'replyWithNix':
        vm.replyWithNix();
        return;
      case 'close':
        vm.leaveViewer('accessibility_escape');
        return;
    }
  };

  const topScrimHeight = vm.insets.top + TOP_SCRIM_EXTRA;
  const bottomScrimHeight = vm.insets.bottom + BOTTOM_SCRIM_EXTRA;

  return (
    <Animated.View
      style={vm.styles.container}
      entering={motionEnabled ? FadeIn.duration(duration.fast) : undefined}
      onMagicTap={togglePause}
      onAccessibilityEscape={() => vm.leaveViewer('accessibility_escape')}>
      {/* Cinema surface: light status bar in both themes. */}
      <StatusBar style="light" hidden={false} />
      <Animated.View style={[vm.styles.backdrop, backdropStyle]} pointerEvents="none" />

      <Animated.View style={[vm.styles.stage, stageStyle]}>
        <ViewerMedia vm={vm} motionEnabled={motionEnabled} />

        <GestureDetector gesture={gesture}>
          <View
            style={vm.styles.touchLayer}
            accessible={mediaVisible}
            accessibilityRole="image"
            accessibilityLabel={vm.mediaAccessibilityLabel}
            accessibilityState={{ disabled: vm.closing }}
            accessibilityActions={a11yActions}
            onAccessibilityAction={onAccessibilityAction}
          />
        </GestureDetector>

        <Animated.View style={[vm.styles.chromeLayer, chromeStyle]} pointerEvents="box-none">
          <View style={[vm.styles.topScrim, { height: topScrimHeight }]} pointerEvents="none" />
          {vm.canReply ? (
            <View style={[vm.styles.bottomScrim, { height: bottomScrimHeight }]} pointerEvents="none" />
          ) : null}
          <ViewerSegmentTimerHud
            queue={vm.queue}
            slideIndex={vm.slideIndex}
            topOffset={vm.insets.top + HUD_TOP_GAP}
            styles={{
              hud: vm.styles.hud,
              segmentTrack: vm.styles.segmentTrack,
              segmentFillDone: vm.styles.segmentFillDone,
              segmentFillActive: vm.styles.segmentFillActive,
            }}
            activeSegmentFillStyle={vm.activeSegmentFillStyle}
            accessibilityValueText={vm.slidePositionLabel}
          />
          <ViewerHeader vm={vm} />
          <ViewerBottomBar vm={vm} onReacted={showReactionPop} />
        </Animated.View>

        <ViewerReactionPop
          pop={reactionPop}
          motionEnabled={motionEnabled}
          onDone={() => setReactionPop(null)}
          layerStyle={vm.styles.reactionPopLayer}
          glyphStyle={vm.styles.reactionPopGlyph}
        />

        <ViewerSpinner vm={vm} active={vm.loading && !vm.viewerError} />
        <ViewerErrorOverlay vm={vm} />
      </Animated.View>

      {/* Capture policy deny: Control Center / app switcher see black, never the NiX. */}
      {vm.shouldBlurOverlay ? <View style={vm.styles.captureMask} pointerEvents="none" /> : null}
    </Animated.View>
  );
}
