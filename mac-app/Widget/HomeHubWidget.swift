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
        // Force the widget to re-fetch immediately so the user sees the next
        // task right after their tap, instead of waiting for the next system
        // timeline refresh.
        WidgetCenter.shared.reloadAllTimelines()
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
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - Widget view

struct HHWidgetView: View {
    let entry: HHEntry

    // Widget palette
    private let bg = Color(.sRGB, red: 0.055, green: 0.066, blue: 0.090, opacity: 1)
    private let text = Color.white
    private let muted = Color(white: 0.55)
    private let good = Color(.sRGB, red: 0.37, green: 0.82, blue: 0.63)
    private let goodBG = Color(.sRGB, red: 0.11, green: 0.23, blue: 0.16)
    private let skipBG = Color(.sRGB, red: 0.165, green: 0.165, blue: 0.21)
    private let accent = Color(.sRGB, red: 0.49, green: 0.61, blue: 1)

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(14)
    }

    @ViewBuilder private var content: some View {
        let s = entry.snapshot
        if let next = s.next {
            if next.eventKind == "gym" {
                gymView(next: next)
            } else {
                checklistView(next: next, dayKey: s.dayKey)
            }
        } else {
            emptyView(eventCount: s.eventCount)
        }
    }

    // ── Gym: entire widget surface → opens app (no done/skip buttons,
    // since each set needs weight/reps/effort entry that the widget can't do).
    private func gymView(next: OpenItem) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(next.eventTitle)
                .font(.system(size: 13, weight: .heavy))
                .lineLimit(1)
                .foregroundStyle(muted)
            Spacer(minLength: 4)
            Text(next.label)
                .font(.system(size: 22, weight: .heavy))
                .lineLimit(2)
                .foregroundStyle(text)
                .minimumScaleFactor(0.75)
            if next.totalSets > 0 {
                Text("Set \(next.setNum) of \(next.totalSets)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(accent)
            }
            Spacer(minLength: 4)
            HStack {
                Text(next.allDay ? "All day" : fmtTime(next.startTime))
                    .font(.system(size: 11))
                    .foregroundStyle(muted)
                Spacer()
                Text("Tap to log →")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(accent)
            }
        }
        .widgetURL(HomeHubConfig.appURL)   // whole widget opens the app
    }

    // ── Meal / simple tasks: ✓ and ↷ buttons (no data to capture).
    private func checklistView(next: OpenItem, dayKey: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(next.eventTitle)
                .font(.system(size: 13, weight: .heavy))
                .lineLimit(1)
                .foregroundStyle(muted)
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                Button(intent: MarkDoneIntent(eventId: next.eventId,
                                              itemKey: next.itemKey,
                                              day: dayKey)) {
                    Text("✓")
                        .font(.system(size: 22, weight: .black))
                        .foregroundStyle(good)
                        .frame(width: 48, height: 48)
                        .background(RoundedRectangle(cornerRadius: 12).fill(goodBG))
                }
                .buttonStyle(.plain)

                Link(destination: HomeHubConfig.appURL) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(next.label)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(text)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(intent: SkipIntent(eventId: next.eventId,
                                          itemKey: next.itemKey,
                                          day: dayKey)) {
                    Text("↷")
                        .font(.system(size: 22, weight: .black))
                        .foregroundStyle(muted)
                        .frame(width: 48, height: 48)
                        .background(RoundedRectangle(cornerRadius: 12).fill(skipBG))
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
            HStack {
                Text(next.allDay ? "All day" : fmtTime(next.startTime))
                    .font(.system(size: 11))
                    .foregroundStyle(muted)
            }
        }
    }

    private func emptyView(eventCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Spacer(minLength: 0)
            if eventCount == 0 {
                Text("Nothing scheduled today.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(muted)
            } else {
                Text("All done for today 🎉")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(good)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(HomeHubConfig.appURL)
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
                .containerBackground(for: .widget) {
                    Color(.sRGB, red: 0.055, green: 0.066, blue: 0.090, opacity: 1)
                }
        }
        .configurationDisplayName("HomeHub Next Task")
        .description("Your next task today.")
        .supportedFamilies([.systemMedium])
        // Bring widget content to the corners — disable the system's auto
        // 16pt padding so our dark background fills edge to edge.
        .contentMarginsDisabled()
    }
}

@main
struct HomeHubWidgetBundle: WidgetBundle {
    var body: some Widget {
        HomeHubWidget()
    }
}
