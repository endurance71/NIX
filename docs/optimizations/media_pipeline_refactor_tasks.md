# Media Pipeline Optimizations — Tasks

## 🔴 High Priority
- [x] **OPT-1**: Bitrate-aware fast-path in `mediaService.ts`
  - [x] Add `playbackDurationMs` to `MediaUploadOptions` / `prepareVideoForUpload` signature
  - [x] Implement bitrate estimation logic in `fastPathEligible`
  - [x] Pass `playbackDurationMs` from `uploadVideoAndCreateNix` → `prepareVideoForUpload`
  - [x] Fix OPT-1: Update fast-path bitrate threshold from 1.25 to 1.4 in `mediaService.ts` and add unit tests.
- [x] Fix OPT-2: Update cache key in `videoThumbnails.ts` to ignore `maxWidth` for higher hit rate between preview and upload.
- [x] Fix OPT-3: Revert `send-to.tsx` to use `uploadNix`, updating it and `useMediaUpload.ts` to accept and pass through `sourceWidth` and `sourceHeight`.
- [x] Fix OPT-6: Add dynamic timeout back to the active video upload path in `mediaService.ts` by using `withTimeout` and `getCompressionTimeout`.

## 🟡 Medium Priority
- [x] **OPT-3**: Smart image resize skip in `prepareImageForUpload`
  - [x] Add optional `sourceWidth`/`sourceHeight` params
  - [x] Skip resize when source < target
  - [x] Pass dimensions from `useCameraScreen` photo capture
- [x] **OPT-4**: Migrate image upload to TUS (uploadResumable)
  - [x] Refactor `uploadImageAndCreateNix` to use `uploadResumable` instead of `uploadWithRetry`
  - [x] Update tests in `mediaService.test.ts` to mock `uploadResumable`
- [x] **OPT-5**: Lazy poster generation in `preview.tsx`
  - [x] Delay thumbnail generation behind 500ms timer
  - [x] Cancel if VideoView renders first frame before timer fires
- [x] **OPT-6**: Dynamic compression timeout in `videoCompressionService.ts`
  - [x] Implement timeout calculation based on file size
  - [x] Pass file size to `compressVideoForUpload`

## 🟢 Low Priority
- [x] **OPT-7**: Parallelize thumbnail + compression in `prepareVideoForUpload`
  - [x] Generate thumbnail from original file in parallel with compression
- [x] **OPT-8**: Memoize camera styles in `useCameraScreen.ts`
  - [x] Wrap `createCameraStyles(colors)` in `useMemo`
- [x] **OPT-11**: Non-blocking temp file cleanup
  - [x] Change `safeDeleteTemporaryUris` to fire-and-forget in non-critical paths

## Deferred (needs investigation)
- [ ] **OPT-9**: Variable recording bitrate (needs UX decision)
- [ ] **OPT-10**: HEVC codec (needs expo-camera verification)
