import WidgetKit
import SwiftUI

/// A simple widget that provides quick access to Freestyle voice dictation.
/// Tapping it deep-links into the app's recording screen.
///
/// Supports:
/// - Lock Screen (accessoryCircular, accessoryRectangular)
/// - Home Screen (systemSmall)

struct FreestyleEntry: TimelineEntry {
    let date: Date
}

struct FreestyleProvider: TimelineProvider {
    func placeholder(in context: Context) -> FreestyleEntry {
        FreestyleEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (FreestyleEntry) -> Void) {
        completion(FreestyleEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FreestyleEntry>) -> Void) {
        let entry = FreestyleEntry(date: Date())
        // Static widget -- refresh once per hour
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

// MARK: - Home Screen Widget (systemSmall)

struct FreestyleSmallView: View {
    var body: some View {
        Link(destination: URL(string: "freestyle://record")!) {
            ZStack {
                ContainerRelativeShape()
                    .fill(Color(red: 0.420, green: 0.561, blue: 0.071)) // olive

                VStack(spacing: 8) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundColor(Color(red: 0.984, green: 0.973, blue: 0.933))

                    Text("Freestyle")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(red: 0.984, green: 0.973, blue: 0.933).opacity(0.8))

                    Text("Tap to dictate")
                        .font(.system(size: 11))
                        .foregroundColor(Color(red: 0.984, green: 0.973, blue: 0.933).opacity(0.6))
                }
            }
        }
    }
}

// MARK: - Lock Screen Widget (accessoryCircular)

struct FreestyleCircularView: View {
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: "mic.fill")
                .font(.system(size: 20, weight: .semibold))
        }
        .widgetURL(URL(string: "freestyle://record"))
    }
}

// MARK: - Lock Screen Widget (accessoryRectangular)

struct FreestyleRectangularView: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "mic.fill")
                .font(.system(size: 18, weight: .semibold))
            VStack(alignment: .leading, spacing: 2) {
                Text("Freestyle")
                    .font(.system(size: 14, weight: .semibold))
                Text("Tap to dictate")
                    .font(.system(size: 12))
                    .opacity(0.7)
            }
        }
        .widgetURL(URL(string: "freestyle://record"))
    }
}

// MARK: - Widget Definition

struct FreestyleWidget: Widget {
    let kind = "FreestyleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FreestyleProvider()) { entry in
            if #available(iOS 17.0, *) {
                FreestyleWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                FreestyleWidgetEntryView(entry: entry)
            }
        }
        .configurationDisplayName("Freestyle")
        .description("Quick access to voice dictation.")
        .supportedFamilies([
            .systemSmall,
            .accessoryCircular,
            .accessoryRectangular,
        ])
    }
}

struct FreestyleWidgetEntryView: View {
    var entry: FreestyleEntry

    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            FreestyleSmallView()
        case .accessoryCircular:
            FreestyleCircularView()
        case .accessoryRectangular:
            FreestyleRectangularView()
        default:
            FreestyleSmallView()
        }
    }
}

// MARK: - Widget Bundle

@main
struct FreestyleWidgetBundle: WidgetBundle {
    var body: some Widget {
        FreestyleWidget()
    }
}
