import WidgetKit
import SwiftUI
internal import ExpoWidgets

@main
struct ExportWidgets0: WidgetBundle {
  var body: some Widget {
    NixInboxWidget()
    if #available(iOS 18.0, *) {
      NixCameraControl()
    }
    WidgetLiveActivity()
  }
}
