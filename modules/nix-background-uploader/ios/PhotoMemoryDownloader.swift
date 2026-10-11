import Foundation
import Photos

/// Ephemeral URLSession with a bounded RAM buffer. No URLCache or temporary plaintext files.
/// Sendable invariant: downloads/cancelled are accessed only under lock; completion
/// removes the continuation under that lock before resuming it exactly once outside it.
final class PhotoMemoryDownloader: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  static let shared = PhotoMemoryDownloader()
  private struct Download {
    let session: URLSession
    let task: URLSessionDataTask
    let limit: Int
    let continuation: CheckedContinuation<[String: Any], Error>
    var data = Data()
    var contentType = "image/jpeg"
    var failure: Error?
  }
  private let lock = NSLock()
  private var downloads: [String: Download] = [:]
  private var cancelled: [String: Date] = [:]

  func download(requestId: String, url: String, bearerToken: String, maxBytes: Int) async throws -> [String: Any] {
    guard let address = URL(string: url), address.scheme == "https", maxBytes > 0, maxBytes <= 4 * 1024 * 1024 else {
      throw URLError(.badURL)
    }
    return try await withCheckedThrowingContinuation { continuation in
      let configuration = URLSessionConfiguration.ephemeral
      configuration.urlCache = nil
      configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
      configuration.httpCookieStorage = nil
      configuration.timeoutIntervalForRequest = 30
      configuration.timeoutIntervalForResource = 45
      let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
      var request = URLRequest(url: address, cachePolicy: .reloadIgnoringLocalCacheData)
      request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
      request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
      let task = session.dataTask(with: request)
      task.taskDescription = requestId
      lock.lock()
      cancelled = cancelled.filter { Date().timeIntervalSince($0.value) < 60 }
      if downloads[requestId] != nil || cancelled.removeValue(forKey: requestId) != nil {
        lock.unlock()
        session.invalidateAndCancel()
        continuation.resume(throwing: URLError(.cancelled))
        return
      }
      downloads[requestId] = Download(session: session, task: task, limit: maxBytes, continuation: continuation)
      lock.unlock()
      task.resume()
    }
  }

  func cancel(requestId: String) {
    lock.lock()
    let task = downloads[requestId]?.task
    if task == nil { cancelled[requestId] = Date() }
    lock.unlock()
    task?.cancel()
  }

  /// Intentional user export goes directly from RAM to Photos, without an app temp file.
  func saveToPhotoLibrary(base64: String, contentType: String) async throws {
    let extensions = ["image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"]
    guard let ext = extensions[contentType], let data = Data(base64Encoded: base64),
          !data.isEmpty, data.count <= 4 * 1024 * 1024 else { throw URLError(.cannotDecodeContentData) }
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      PHPhotoLibrary.shared().performChanges {
        let options = PHAssetResourceCreationOptions()
        options.originalFilename = "NiX.\(ext)"
        PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: options)
      } completionHandler: { success, error in
        if success { continuation.resume() }
        else { continuation.resume(throwing: error ?? URLError(.cannotCreateFile)) }
      }
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    // Do not forward the captured JWT to a redirected endpoint.
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let id = dataTask.taskDescription else { completionHandler(.cancel); return }
    lock.lock()
    guard var download = downloads[id] else { lock.unlock(); completionHandler(.cancel); return }
    let http = response as? HTTPURLResponse
    let mime = response.mimeType?.lowercased() ?? ""
    if http?.statusCode != 200 || !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].contains(mime) || response.expectedContentLength > Int64(download.limit) {
      download.failure = URLError(.badServerResponse)
      downloads[id] = download
      lock.unlock()
      completionHandler(.cancel)
      return
    }
    download.contentType = mime
    downloads[id] = download
    lock.unlock()
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let id = dataTask.taskDescription else { return }
    lock.lock()
    guard var download = downloads[id] else { lock.unlock(); return }
    if download.data.count + data.count > download.limit {
      download.failure = URLError(.dataLengthExceedsMaximum)
      downloads[id] = download
      lock.unlock()
      dataTask.cancel()
      return
    }
    download.data.append(data)
    downloads[id] = download
    lock.unlock()
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let id = task.taskDescription else { return }
    lock.lock()
    let download = downloads.removeValue(forKey: id)
    lock.unlock()
    session.finishTasksAndInvalidate()
    guard let download else { return }
    if let failure = download.failure ?? error {
      download.continuation.resume(throwing: failure)
    } else if download.data.isEmpty {
      download.continuation.resume(throwing: URLError(.zeroByteResource))
    } else {
      download.continuation.resume(returning: ["base64": download.data.base64EncodedString(), "contentType": download.contentType])
    }
  }
}
