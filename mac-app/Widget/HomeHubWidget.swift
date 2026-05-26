// HomeHubWidget.swift
// macOS / iOS WidgetKit extension. Bold/energetic ("B+ primary") design with
// real psychological levers: streak, progress, last-set anchor, next-up.
import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Timeline entry

struct HHEntry: TimelineEntry {
    let date: Date
    let snapshot: HHSnapshot
}

struct HHProvider: TimelineProvider {
    private static var emptySnap: HHSnapshot {
        HHSnapshot(dayKey: HomeHubParser.ymd(Date()), next: nil,
                   totalDone: 0, totalAll: 0, eventCount: 0,
                   streakDays: 0, nextUp: nil)
    }
    func placeholder(in context: Context) -> HHEntry {
        HHEntry(date: Date(), snapshot: Self.emptySnap)
    }
    func getSnapshot(in context: Context, completion: @escaping (HHEntry) -> Void) {
        Task {
            let snap = (try? await HomeHubService.loadSnapshot()) ?? Self.emptySnap
            completion(HHEntry(date: Date(), snapshot: snap))
        }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<HHEntry>) -> Void) {
        Task {
            let snap = (try? await HomeHubService.loadSnapshot()) ?? Self.emptySnap
            let entry = HHEntry(date: Date(), snapshot: snap)
            let next = Date().addingTimeInterval(600)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - App Intents (silent done/skip — for meal & simple events only)

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
        try await HomeHubService.upsertProgress(eventId: eventId, dayKey: day,
                                                itemKey: itemKey,
                                                done: true, skipped: false)
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
        try await HomeHubService.upsertProgress(eventId: eventId, dayKey: day,
                                                itemKey: itemKey,
                                                done: false, skipped: true)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - Color tokens

private enum HHColor {
    static let bgBase = Color(.sRGB, red: 0.063, green: 0.075, blue: 0.114, opacity: 1)   // #10131d
    static let bgBaseDeep = Color(.sRGB, red: 0.027, green: 0.035, blue: 0.059, opacity: 1) // #07090f
    static let heat = Color(.sRGB, red: 0.988, green: 0.298, blue: 0.008, opacity: 1)     // #fc4c02
    static let heatDeep = Color(.sRGB, red: 0.839, green: 0.239, blue: 0.0, opacity: 1)   // #d63d00
    static let heatSoft = Color(.sRGB, red: 1.0, green: 0.478, blue: 0.227, opacity: 1)   // #ff7a3a
    static let burn = Color(.sRGB, red: 0.961, green: 0.627, blue: 0.176, opacity: 1)     // #f5a02d
    static let muted = Color(.sRGB, red: 0.541, green: 0.565, blue: 0.659, opacity: 1)    // #8a90a8
    static let dim = Color(.sRGB, red: 0.290, green: 0.314, blue: 0.400, opacity: 1)      // #4a5066
    static let text = Color.white
    static let barTrack = Color.white.opacity(0.07)
    static let good = Color(.sRGB, red: 0.37, green: 0.82, blue: 0.63, opacity: 1)
}

// MARK: - Widget view

struct HHWidgetView: View {
    let entry: HHEntry

    var body: some View {
        ZStack(alignment: .bottom) {
            // Backdrop: gradient + heat glow.
            backdrop

            // Content (NOT including progress bar)
            content
                .padding(EdgeInsets(top: 14, leading: 16, bottom: 24, trailing: 16))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            // Progress bar — flush at the bottom edge
            progressBar
        }
        // Whole-widget tap target falls back to the PWA. Buttons inside (for
        // meal/simple) take precedence over this for their tap regions.
        .widgetURL(HomeHubConfig.appURL)
    }

    // MARK: backdrop

    private var backdrop: some View {
        ZStack {
            LinearGradient(colors: [HHColor.bgBase, HHColor.bgBaseDeep],
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(
                gradient: Gradient(colors: [HHColor.heat.opacity(0.32), .clear]),
                center: UnitPoint(x: 1.0, y: 1.1),
                startRadius: 0, endRadius: 280
            )
            RadialGradient(
                gradient: Gradient(colors: [HHColor.muted.opacity(0.06), .clear]),
                center: UnitPoint(x: 0.0, y: 0.0),
                startRadius: 0, endRadius: 180
            )
        }
    }

    // MARK: content router

    @ViewBuilder private var content: some View {
        let s = entry.snapshot
        if let next = s.next {
            if next.eventKind == "gym" {
                gymView(next: next, snap: s)
            } else {
                checklistView(next: next, snap: s)
            }
        } else {
            emptyView(eventCount: s.eventCount)
        }
    }

    // MARK: gym (B+ primary)

    private func gymView(next: OpenItem, snap: HHSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // TOP: streak pill + event title + time
            topStrip(next: next, snap: snap)

            Spacer(minLength: 4)

            // FOCAL: exercise name + anchor row
            VStack(alignment: .leading, spacing: 6) {
                Text(next.label)
                    .font(.system(size: 28, weight: .heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .foregroundStyle(HHColor.text)
                    .shadow(color: HHColor.heat.opacity(0.15), radius: 12)
                anchorRow(next: next)
            }

            Spacer(minLength: 4)

            // BOTTOM: next-up + CTA pill
            bottomRow(next: next, snap: snap)
        }
    }

    private func topStrip(next: OpenItem, snap: HHSnapshot) -> some View {
        HStack(spacing: 8) {
            if snap.streakDays > 0 {
                streakPill(snap.streakDays)
            }
            Spacer(minLength: 4)
            Text(eventLabel(next: next))
                .font(.system(size: 10.5, weight: .bold))
                .tracking(0.9)
                .textCase(.uppercase)
                .foregroundStyle(HHColor.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func eventLabel(next: OpenItem) -> AttributedString {
        var s = AttributedString("\(stripTitle(next.eventTitle))  ·  ")
        s.foregroundColor = HHColor.muted
        var t = AttributedString(next.allDay ? "all day" : fmtTime(next.startTime))
        t.foregroundColor = HHColor.heatSoft
        s.append(t)
        return s
    }

    // Strip leading emoji + leading "Gym — " for tighter display.
    private func stripTitle(_ t: String) -> String {
        let trimmed = t.replacingOccurrences(of: #"^\p{Emoji}+\s*"#,
                                             with: "", options: .regularExpression)
        return trimmed
            .replacingOccurrences(of: #"^Gym\s+[—-]\s+"#, with: "", options: .regularExpression)
    }

    private func streakPill(_ days: Int) -> some View {
        HStack(spacing: 4) {
            Text("🔥").font(.system(size: 11))
            Text("\(days)")
                .font(.system(size: 12, weight: .black))
                .tracking(0.3)
        }
        .foregroundStyle(HHColor.heatSoft)
        .padding(.horizontal, 9)
        .padding(.vertical, 2)
        .background(
            Capsule()
                .fill(HHColor.heat.opacity(0.18))
                .overlay(Capsule().stroke(HHColor.heat.opacity(0.45), lineWidth: 1))
        )
    }

    private func anchorRow(next: OpenItem) -> some View {
        HStack(spacing: 10) {
            if next.totalSets > 0 {
                Text("SET \(next.setNum)/\(next.totalSets)")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.5)
                    .foregroundStyle(HHColor.muted)
            }
            if let weight = next.lastSetWeight, !weight.isEmpty {
                Text("VS")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.0)
                    .foregroundStyle(HHColor.dim)
                Text(lastSetText(next))
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(HHColor.heatSoft)
            }
            Spacer(minLength: 0)
        }
    }

    private func lastSetText(_ next: OpenItem) -> AttributedString {
        var s = AttributedString("last ")
        s.foregroundColor = HHColor.heatSoft
        var w = AttributedString(next.lastSetWeight ?? "")
        w.foregroundColor = HHColor.heatSoft
        s.append(w)
        if let reps = next.lastSetReps, !reps.isEmpty {
            var x = AttributedString("×")
            x.foregroundColor = HHColor.burn
            s.append(x)
            var r = AttributedString(reps)
            r.foregroundColor = HHColor.heatSoft
            s.append(r)
        }
        if let effort = next.lastSetEffort, !effort.isEmpty, effort != "nothing" {
            var e = AttributedString(" \(effort.replacingOccurrences(of: "_", with: " "))")
            e.foregroundColor = HHColor.heatSoft
            s.append(e)
        }
        return s
    }

    private func bottomRow(next: OpenItem, snap: HHSnapshot) -> some View {
        HStack(alignment: .bottom) {
            if let nu = snap.nextUp {
                VStack(alignment: .leading, spacing: 1) {
                    Text("NEXT")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.1)
                        .foregroundStyle(HHColor.dim)
                    Text("\(stripTitle(nu.title)) \(nu.allDay ? "" : fmtTime(nu.startTime))")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(HHColor.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            ctaPill
        }
    }

    private var ctaPill: some View {
        HStack(spacing: 6) {
            Text("Tap to log")
                .font(.system(size: 12, weight: .black))
                .tracking(0.8)
                .textCase(.uppercase)
            Text("→")
                .font(.system(size: 13, weight: .black))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            LinearGradient(colors: [HHColor.heat, HHColor.heatDeep],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            .clipShape(Capsule())
        )
        .overlay(
            Capsule().stroke(Color.white.opacity(0.22), lineWidth: 1)
                .blendMode(.overlay)
        )
        .shadow(color: HHColor.heat.opacity(0.45), radius: 9, x: 0, y: 6)
    }

    // MARK: meal / simple — keep the ✓ / ↷ buttons

    private func checklistView(next: OpenItem, snap: HHSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            topStrip(next: next, snap: snap)
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                Button(intent: MarkDoneIntent(eventId: next.eventId,
                                              itemKey: next.itemKey,
                                              day: snap.dayKey)) {
                    Text("✓")
                        .font(.system(size: 22, weight: .black))
                        .foregroundStyle(HHColor.good)
                        .frame(width: 48, height: 48)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.sRGB, red: 0.11, green: 0.23, blue: 0.16, opacity: 1))
                        )
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(next.label)
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundStyle(HHColor.text)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button(intent: SkipIntent(eventId: next.eventId,
                                          itemKey: next.itemKey,
                                          day: snap.dayKey)) {
                    Text("↷")
                        .font(.system(size: 22, weight: .black))
                        .foregroundStyle(HHColor.muted)
                        .frame(width: 48, height: 48)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.sRGB, red: 0.165, green: 0.165, blue: 0.21, opacity: 1))
                        )
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    private func emptyView(eventCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            if eventCount == 0 {
                Text("Nothing scheduled today.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(HHColor.muted)
            } else {
                Text("All done for today 🎉")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(HHColor.good)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: progress bar (flush bottom)

    private var progressBar: some View {
        GeometryReader { geo in
            let s = entry.snapshot
            let pct = s.totalAll > 0 ? CGFloat(s.totalDone) / CGFloat(s.totalAll) : 0
            ZStack(alignment: .leading) {
                HHColor.barTrack
                LinearGradient(colors: [HHColor.burn, HHColor.heat],
                               startPoint: .leading, endPoint: .trailing)
                .frame(width: max(geo.size.width * pct, pct > 0 ? 4 : 0))
                .shadow(color: HHColor.heat.opacity(0.55), radius: 6)
            }
        }
        .frame(height: 5)
    }

    private func fmtTime(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "h:mma"; f.amSymbol = "am"; f.pmSymbol = "pm"
        return f.string(from: d).lowercased()
    }
}

// MARK: - Widget bundle

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
        .contentMarginsDisabled()
    }
}

@main
struct HomeHubWidgetBundle: WidgetBundle {
    var body: some Widget {
        HomeHubWidget()
    }
}
