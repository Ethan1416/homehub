// HomeHubWidget.swift
// macOS WidgetKit extension with two interactive buttons (Done / Skip).
import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Timeline entry

struct HHEntry: TimelineEntry {
    let date: Date
    let snapshot: HHSnapshot
}

struct HHProvider: TimelineProvider {
    func placeholder(in context: Context) -> HHEntry {
        HHEntry(date: Date(),
                snapshot: HHSnapshot(dayKey: HomeHubParser.ymd(Date()),
                                     next: nil, totalDone: 0, totalAll: 0, eventCount: 0))
    }

    func getSnapshot(in context: Context, completion: @escaping (HHEntry) -> Void) {
        Task {
            let snap = (try? await HomeHubService.loadSnapshot())
                ?? HHSnapshot(dayKey: HomeHubParser.ymd(Date()), next: nil,
                              totalDone: 0, totalAll: 0, eventCount: 0)
            completion(HHEntry(date: Date(), snapshot: snap))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HHEntry>) -> Void) {
        Task {
            let snap = (try? await HomeHubService.loadSnapshot())
                ?? HHSnapshot(dayKey: HomeHubParser.ymd(Date()), next: nil,
                              totalDone: 0, totalAll: 0, eventCount: 0)
            let entry = HHEntry(date: Date(), snapshot: snap)
            // Refresh every 10 minutes (system may rate-limit)
            let next = Date().addingTimeInterval(600)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - App Intents (tap → upsert progress)

struct MarkDoneIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark Done"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Event ID") var eventId: String
    @Parameter(title: "Item Key") var itemKey: String
    @Parameter(title: "Day") var day: String

    init() {}
    init(eventId: String, itemKey: String, day: String) {
        self.eventId = eventId; self.itemKey = itemKey; self.day = day
    }

    func perform() async throws -> some IntentResult {
        try await HomeHubService.upsertProgress(
            eventId: eventId, dayKey: day, itemKey: itemKey,
            done: true, skipped: false)
        return .result()
    }
}

struct SkipIntent: AppIntent {
    static var title: LocalizedStringResource = "Skip"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Event ID") var eventId: String
    @Parameter(title: "Item Key") var itemKey: String
    @Parameter(title: "Day") var day: String

    init() {}
    init(eventId: String, itemKey: String, day: String) {
        self.eventId = eventId; self.itemKey = itemKey; self.day = day
    }

    func perform() async throws -> some IntentResult {
        try await HomeHubService.upsertProgress(
            eventId: eventId, dayKey: day, itemKey: itemKey,
            done: false, skipped: true)
        return .result()
    }
}

// MARK: - Widget view

struct HHWidgetView: View {
    let entry: HHEntry

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color(.sRGB, red: 0.055, green: 0.066, blue: 0.090, opacity: 1)
            content
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
        }
        .widgetURL(HomeHubConfig.appURL)
    }

    @ViewBuilder private var content: some View {
        let s = entry.snapshot
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("HOMEHUB")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(white: 0.55))
                    .tracking(0.5)
                Spacer()
                if s.totalAll > 0 {
                    Text("\(s.totalDone)/\(s.totalAll)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(white: 0.55))
                }
            }

            if let next = s.next {
                Text(next.eventTitle)
                    .font(.system(size: 14, weight: .heavy))
                    .lineLimit(1)
                    .foregroundStyle(.white)

                HStack(spacing: 10) {
                    Button(intent: MarkDoneIntent(eventId: next.eventId,
                                                  itemKey: next.itemKey,
                                                  day: s.dayKey)) {
                        Text("✓")
                            .font(.system(size: 22, weight: .black))
                            .foregroundStyle(Color(.sRGB, red: 0.37, green: 0.82, blue: 0.63))
                            .frame(width: 48, height: 48)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(.sRGB, red: 0.11, green: 0.23, blue: 0.16))
                            )
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(next.label)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        if next.totalSets > 0 {
                            Text("set \(next.setNum)/\(next.totalSets)")
                                .font(.system(size: 11))
                                .foregroundStyle(Color(.sRGB, red: 0.49, green: 0.61, blue: 1))
                        }
                    }
                    Spacer(minLength: 0)

                    Button(intent: SkipIntent(eventId: next.eventId,
                                              itemKey: next.itemKey,
                                              day: s.dayKey)) {
                        Text("↷")
                            .font(.system(size: 22, weight: .black))
                            .foregroundStyle(Color(white: 0.65))
                            .frame(width: 48, height: 48)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(.sRGB, red: 0.165, green: 0.165, blue: 0.21))
                            )
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 0)
                HStack {
                    Text(next.allDay ? "All day" : fmtTime(next.startTime))
                        .font(.system(size: 11))
                        .foregroundStyle(Color(white: 0.55))
                    Spacer()
                    Text("\(next.eventDone)/\(next.eventTotal)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color(.sRGB, red: 0.37, green: 0.82, blue: 0.63))
                }
            } else {
                Spacer(minLength: 0)
                if s.eventCount == 0 {
                    Text("Nothing scheduled today.")
                        .font(.system(size: 13))
                        .foregroundStyle(Color(white: 0.68))
                } else {
                    Text("All done for today 🎉")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color(.sRGB, red: 0.37, green: 0.82, blue: 0.63))
                    Text("\(s.totalAll)/\(s.totalAll) moved past")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(white: 0.55))
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func fmtTime(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "h:mma"; f.amSymbol = "am"; f.pmSymbol = "pm"
        return f.string(from: d).lowercased()
    }
}

// MARK: - Widget config

struct HomeHubWidget: Widget {
    let kind = "HomeHubWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HHProvider()) { entry in
            HHWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("HomeHub Next Task")
        .description("Your next task today with Done / Skip buttons.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct HomeHubWidgetBundle: WidgetBundle {
    var body: some Widget {
        HomeHubWidget()
    }
}
