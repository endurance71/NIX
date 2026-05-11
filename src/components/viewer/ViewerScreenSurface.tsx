import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useViewerScreen } from '../../hooks/useViewerScreen';
import { ViewerNixVideo } from './ViewerNixVideo';
import { ViewerSegmentTimerHud } from './ViewerSegmentTimerHud';

const NIX_IMAGE_PLACEHOLDER = 'L00000fQfQfQfQfQfQfQfQfQfQfQ';

export function ViewerScreenSurface() {
  const vm = useViewerScreen();

  if (vm.isBootLoading) {
    return (
      <View style={vm.styles.container}>
        <ActivityIndicator color={vm.colors.label} />
      </View>
    );
  }

  return (
    <Animated.View style={vm.styles.container} entering={FadeIn}>
      <StatusBar style={vm.statusBarStyle} hidden />

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
                nixId={vm.displayedNix.id}
                onReady={vm.onVideoReady}
                onError={vm.onVideoError}
                onPlayToEnd={vm.finishCurrentSlide}
                onProgress={(nextProgress) => {
                  vm.segmentProgress.value = nextProgress;
                }}
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
              placeholderContentFit="cover"
              style={vm.styles.image}
              contentFit="cover"
              transition={380}
              cachePolicy="memory-disk"
              onLoad={vm.onPrimaryImageLoad}
              onError={vm.onPrimaryImageError}
            />
          ) : (
            <ExpoImage
              source={{ uri: vm.imageUrl }}
              cachePolicy="none"
              style={vm.styles.image}
              contentFit="cover"
              onLoad={vm.onFallbackImageLoad}
              onError={vm.onFallbackImageError}
            />
          )}
        </View>
      ) : null}
      {vm.imageReady && !vm.imageLoadError ? (
        <Pressable
          style={vm.styles.dismissArea}
          onPress={vm.finishCurrentSlide}
          disabled={vm.closing}
          accessibilityLabel="Przejdź do następnego fragmentu"
          accessibilityRole="button"
        />
      ) : null}
      {vm.loading && !vm.imageLoadError ? (
        <View style={vm.styles.loadingOverlaySolid}>
          <ActivityIndicator color={vm.colors.label} />
        </View>
      ) : null}
      {vm.imageLoadError ? (
        <View style={vm.styles.errorOverlay}>
          <Text style={vm.styles.errorText}>{vm.imageLoadError}</Text>
          <Pressable
            style={vm.styles.backButton}
            onPress={() => router.back()}
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
