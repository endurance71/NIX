import ExpoModulesCore
import UIKit

public final class NixBackgroundUploaderAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == BackgroundUploadCoordinator.sessionIdentifier else {
      completionHandler()
      return
    }
    BackgroundUploadCoordinator.shared.attachBackgroundCompletion(completionHandler)
  }
}
