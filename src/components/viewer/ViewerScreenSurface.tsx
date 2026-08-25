import { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useViewerScreen } from '../../hooks/useViewerScreen';
import { ViewerNixVideo } from './ViewerNixVideo';
import { ViewerSegmentTimerHud } from './ViewerSegmentTimerHud';
import { NativeChromeIconButton } from '../ui/native-chrome-icon-button';
import { mediaContentFit } from '../../lib/mediaPresentation';

const NIX_IMAGE_PLACEHOLDER = 'L00000fQfQfQfQfQfQfQfQfQfQfQ';

export function ViewerScreenSurface() {
  const vm = useViewerScreen();
  const [measuredImage, setMeasuredImage] = useState<{
    uri: string | null;
    width?: number;
    height?: number;
  }>({ uri: null });
  const imageDimensions = measuredImage.uri === vm.imageUrl ? measuredImage : {};
  const imageFit = mediaContentFit(imageDimensions);

  if (vm.isBootLoading) {
    return (
      <View style={vm.styles.container}>
        <ActivityIndicator color={vm.colors.cameraControlTint} />
      </View>
    );
  }

  return (
    <Animated.View style={vm.styles.container} entering={FadeIn}>
      <StatusBar style={vm.statusBarStyle} hidden={false} />

      <ViewerSegmentTimerHud
        queue={vm.queue}
        slideIndex={vm.slideIndex}
        topOffset={vm.insets.top + 10}
        isDark={vm.isDark}
        styles={{
          timerHudShell: vm.styles.timerHudShell,
          timerBlur: vm.styles.timerBlur,
          timerHudInner: vm.styles.timerHudInner,
          segmentsRow: vm.styles.segmentsRow,
          segmentCell: vm.styles.segmentCell,
          timerTrack: vm.styles.timerTrack,
          segmentFill: vm.styles.segmentFill,
          segmentFillDone: vm.styles.segmentFillDone,
          segmentProgressMask: vm.styles.segmentProgressMask,
        }}
        activeSegmentMaskStyle={vm.activeSegmentMaskStyle}
      />

      {!vm.imageUrl && vm.currentNix?.media_type === 'video' && vm.videoPosterUri ? (
        <View style={vm.styles.imageContainer}>
          <ExpoImage source={{ uri: vm.videoPosterUri }} style={vm.styles.image} contentFit="cover" />
        </View>
      ) : null}
      {vm.imageUrl ? (
        <View style={vm.styles.imageContainer}>
          {vm.displayedNix?.media_type === 'video' ? (
            <View style={vm.styles.imageContainer}>
              {!vm.imageReady && vm.videoThumbnailOverlay ? (
                <ExpoImage source={vm.videoThumbnailOverlay} style={vm.styles.image} contentFit="cover" />
              ) : null}
              <ViewerNixVideo
                key={`${vm.displayedNix.id}-${vm.imageUrl}`}
                uri={vm.imageUrl}
                onReady={vm.onVideoReady}
                onError={vm.onVideoError}
                onPlayToEnd={vm.finishCurrentSlide}
                onProgress={vm.onSegmentProgress}
                paused={vm.safetyPaused}
                loop={vm.displayedNix.view_duration_sec === 0}
                style={vm.styles.image}
              />
            </View>
          ) : !vm.useNativeFallback ? (
            <ExpoImage
              source={{
                uri: vm.imageUrl,
                cacheKey: vm.displayedNix?.media_path ?? vm.imageUrl,
              }}
              placeholder={NIX_IMAGE_PLACEHOLDER}
              placeholderContentFit="contain"
              style={vm.styles.image}
              contentFit={imageFit}
              transition={380}
              cachePolicy="memory-disk"
              onLoad={(event) => {
                setMeasuredImage({ uri: vm.imageUrl, ...event.source });
                vm.onPrimaryImageLoad();
              }}
              onError={vm.onPrimaryImageError}
            />
          ) : (
            <ExpoImage
              source={{ uri: vm.imageUrl }}
              cachePolicy="none"
              style={vm.styles.image}
              contentFit={imageFit}
              onLoad={(event) => {
                setMeasuredImage({ uri: vm.imageUrl, ...event.source });
                vm.onFallbackImageLoad();
              }}
              onError={vm.onFallbackImageError}
            />
          )}
        </View>
      ) : null}
      {vm.imageReady && !vm.imageLoadError ? (
        <Pressable
          style={vm.styles.dismissArea}
          onPress={vm.finishCurrentSlide}
          disabled={vm.closing || !vm.canDismissByTap}
          accessibilityLabel="Przejdź do następnego fragmentu"
          accessibilityRole="button"
        />
      ) : null}
      {vm.safetyAvailable ? (
        <Pressable
          style={[vm.styles.safetyButton, { top: vm.insets.top + 44 }]}
          onPress={vm.openSafetyMenu}
          disabled={vm.safetyBusy}
          accessibilityLabel="Bezpieczeństwo wiadomości"
          accessibilityRole="button">
          <Text style={vm.styles.safetyButtonText}>•••</Text>
        </Pressable>
      ) : null}
      {vm.canSaveToGallery && vm.imageUrl && !vm.imageLoadError ? (
        <View style={[vm.styles.saveButtonWrap, { bottom: vm.insets.bottom + 16 }]}>
          <NativeChromeIconButton
            name="saveToPhotos"
            accessibilityLabel={vm.saveToGalleryA11y}
            onPress={vm.saveToGallery}
            disabled={vm.isSavingToGallery || vm.closing || !vm.imageReady}
            backgroundColor={vm.colors.cameraControlBackground}
            tintColor={vm.colors.cameraControlTint}
            chromeVariant="glass"
          />
        </View>
      ) : null}
      {vm.loading && !vm.viewerError ? (
        <View style={vm.styles.loadingOverlaySolid}>
          <ActivityIndicator color={vm.colors.cameraControlTint} />
        </View>
      ) : null}
      {vm.viewerError ? (
        <View style={vm.styles.errorOverlay}>
          <Text style={vm.styles.errorText}>{vm.viewerError.message}</Text>
          {vm.viewerError.kind === 'transient' ? (
            <Pressable style={vm.styles.backButton} onPress={vm.retryViewer} accessibilityLabel="Spróbuj ponownie" accessibilityRole="button">
              <Text style={vm.styles.backButtonText}>Spróbuj ponownie</Text>
            </Pressable>
          ) : null}
          {vm.viewerError.kind === 'permanentMissing' && vm.currentNix ? (
            <Pressable style={vm.styles.backButton} onPress={vm.skipUnavailable} accessibilityLabel="Pomiń niedostępne medium" accessibilityRole="button">
              <Text style={vm.styles.backButtonText}>Pomiń</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={vm.styles.backButton}
            onPress={vm.leaveViewer}
            accessibilityLabel="Wróć"
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={vm.styles.backButtonText}>Wróć</Text>
          </Pressable>
        </View>
      ) : null}
      {vm.shouldBlurOverlay ? (
        <View style={vm.styles.captureBlurMask} pointerEvents="none">
          <BlurView intensity={95} tint={vm.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
    </Animated.View>
  );
}
