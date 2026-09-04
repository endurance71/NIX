#!/usr/bin/env swift
/**
 * Local smoke: re-encode synthetic video audio with the same AAC settings as the
 * patched react-native-compressor VideoMain.exportVideoHelper (audioBitRate).
 * Does not mock Video.compress; exercises AVEncoderBitRateKey on device/simulator host.
 *
 * Usage:
 *   swift scripts/ios-audio-bitrate-smoke.swift <input.mp4> <output.mp4> [audioBitrate]
 */
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
  fputs("usage: ios-audio-bitrate-smoke.swift <in.mp4> <out.mp4> [audioBitrate=96000]\n", stderr)
  exit(2)
}

let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
let requestedAudioBitRate = args.count >= 4 ? (Int(args[3]) ?? 96_000) : 96_000
let audioBitRate = max(requestedAudioBitRate, 32_000)

if FileManager.default.fileExists(atPath: outputURL.path) {
  try? FileManager.default.removeItem(at: outputURL)
}

let asset = AVAsset(url: inputURL)
guard let videoTrack = asset.tracks(withMediaType: .video).first else {
  fputs("no video track\n", stderr)
  exit(1)
}

let semaphore = DispatchSemaphore(value: 0)
var exportError: Error?

Task {
  do {
    let duration = try await asset.load(.duration)
    let naturalSize = try await videoTrack.load(.naturalSize)
    let transform = try await videoTrack.load(.preferredTransform)
    let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)

    let reader = try AVAssetReader(asset: asset)
    let videoReaderOutput = AVAssetReaderTrackOutput(
      track: videoTrack,
      outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      ]
    )
    videoReaderOutput.alwaysCopiesSampleData = false
    reader.add(videoReaderOutput)

    var audioReaderOutput: AVAssetReaderTrackOutput?
    if let audioTrack = asset.tracks(withMediaType: .audio).first {
      let audioOut = AVAssetReaderTrackOutput(
        track: audioTrack,
        outputSettings: [
          AVFormatIDKey: kAudioFormatLinearPCM,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMBitDepthKey: 16,
          AVLinearPCMIsNonInterleaved: false,
        ]
      )
      audioOut.alwaysCopiesSampleData = false
      reader.add(audioOut)
      audioReaderOutput = audioOut
    }

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    let width = abs(Int(naturalSize.applying(transform).width))
    let height = abs(Int(naturalSize.applying(transform).height))
    let fps = max(Int(nominalFrameRate.rounded()), 24)

    let videoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width == 0 ? 1280 : width,
        AVVideoHeightKey: height == 0 ? 720 : height,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: 1_800_000,
          AVVideoExpectedSourceFrameRateKey: fps,
        ],
      ]
    )
    videoInput.expectsMediaDataInRealTime = false
    videoInput.transform = transform
    writer.add(videoInput)

    var audioInput: AVAssetWriterInput?
    if audioReaderOutput != nil {
      // Mirrors patched VideoMain.swift audioOutputConfiguration (+ CBR so
      // ffprobe reports a stable bit_rate near the requested target).
      let aac = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVEncoderBitRateKey: audioBitRate,
          AVEncoderBitRateStrategyKey: AVAudioBitRateStrategy_Constant,
          AVNumberOfChannelsKey: 2,
          AVSampleRateKey: 44_100,
        ]
      )
      aac.expectsMediaDataInRealTime = false
      writer.add(aac)
      audioInput = aac
    }

    guard reader.startReading() else {
      throw reader.error ?? NSError(domain: "smoke", code: 1)
    }
    guard writer.startWriting() else {
      throw writer.error ?? NSError(domain: "smoke", code: 2)
    }
    writer.startSession(atSourceTime: .zero)

    let videoQueue = DispatchQueue(label: "smoke.video")
    let audioQueue = DispatchQueue(label: "smoke.audio")
    let group = DispatchGroup()

    group.enter()
    videoInput.requestMediaDataWhenReady(on: videoQueue) {
      while videoInput.isReadyForMoreMediaData {
        if let sample = videoReaderOutput.copyNextSampleBuffer() {
          if !videoInput.append(sample) {
            break
          }
        } else {
          videoInput.markAsFinished()
          group.leave()
          break
        }
      }
    }

    if let audioReaderOutput, let audioInput {
      group.enter()
      audioInput.requestMediaDataWhenReady(on: audioQueue) {
        while audioInput.isReadyForMoreMediaData {
          if let sample = audioReaderOutput.copyNextSampleBuffer() {
            if !audioInput.append(sample) {
              break
            }
          } else {
            audioInput.markAsFinished()
            group.leave()
            break
          }
        }
      }
    }

    group.wait()
    await writer.finishWriting()
    if writer.status != .completed {
      throw writer.error ?? NSError(domain: "smoke", code: 3, userInfo: [
        NSLocalizedDescriptionKey: "writer status \(writer.status.rawValue)",
      ])
    }
    fputs(
      "OK duration_sec=\(CMTimeGetSeconds(duration)) audioBitRate=\(audioBitRate) out=\(outputURL.path)\n",
      stderr
    )
  } catch {
    exportError = error
  }
  semaphore.signal()
}

semaphore.wait()
if let exportError {
  fputs("export failed: \(exportError)\n", stderr)
  exit(1)
}
exit(0)
