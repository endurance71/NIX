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
    .description(Text(verbatim: Locale.preferredLanguages.first?.hasPrefix("pl") ?? false ? "Nowe NiX-y w skrzynce" : "New NiXes in your inbox"))
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
  }
}
