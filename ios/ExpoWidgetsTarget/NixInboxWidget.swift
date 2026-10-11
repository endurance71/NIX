import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct NixInboxWidget: Widget {
  let name: String = "NixInboxWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("NiX")
    .description("Nowe NiX-y w skrzynce")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
  }
}
