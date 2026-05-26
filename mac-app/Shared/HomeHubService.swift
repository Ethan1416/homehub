// HomeHubService.swift
// Shared Supabase data layer used by both the app and the widget extension.
import Foundation

struct HomeHubConfig {
    static let supabaseURL = "https://kiuxegztynurpthxsnvr.supabase.co"
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpdXhlZ3p0eW51cnB0aHhzbnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxOTgxODksImV4cCI6MjA5NDc3NDE4OX0.XLYO2XCmXtfQvzD1tJGgdYZrqmMSBzsQBnXXZfz31ss"
    static let user = "ethan"
    static let appURL = URL(string: "https://ethan1416.github.io/homehub/")!
}

struct HHEvent: Decodable {
    let id: String
    let title: String
    let notes: String?
    let starts_at: String
    let type: String?
    let recurrence: String?
    let all_day: Bool?
}

struct ProgressRow: Decodable {
    let event_id: String
    let log_date: String
    let item_key: String
    let user_id: String
    let done: Bool?
    let skipped: Bool?
    let weight: String?
    let reps: String?
    let effort: String?
}

struct GymOverride: Decodable {
    let event_id: String
    let log_date: String
    let user_id: String
}

// Parsed checklist groups for an event.
struct ChecklistGroup {
    let key: String
    let label: String
    let sets: Int
}

enum ChecklistKind { case gym, meal, simple }

struct ParsedEvent {
    let kind: ChecklistKind
    let groups: [ChecklistGroup]
}

enum HomeHubParser {
    static func parse(_ ev: HHEvent) -> ParsedEvent {
        let lines = (ev.notes ?? "")
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let isExercise = { (l: String) -> Bool in
            l.range(of: #"^\d+[.)]\s"#, options: .regularExpression) != nil
        }
        let titleGym = (ev.title).range(of: #"(?i)gym|🏋"#, options: .regularExpression) != nil
        if lines.contains(where: isExercise) || (titleGym && !lines.isEmpty) {
            var groups: [ChecklistGroup] = []
            for line in lines where isExercise(line) {
                groups.append(.init(key: "g\(groups.count)", label: line, sets: setCount(line)))
            }
            return ParsedEvent(kind: .gym, groups: groups)
        }
        if !lines.isEmpty {
            let joined = lines.joined(separator: " / ")
            let parts = joined
                .components(separatedBy: CharacterSet(charactersIn: "/;"))
                .map { $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".;")) }
                .filter { $0.count > 1 }
            var groups: [ChecklistGroup] = []
            for (i, p) in parts.enumerated() {
                groups.append(.init(key: "m\(i)", label: p, sets: 0))
            }
            return ParsedEvent(kind: .meal, groups: groups)
        }
        return ParsedEvent(kind: .simple, groups: [.init(key: "__done__", label: ev.title, sets: 0)])
    }

    static func setCount(_ line: String) -> Int {
        func clamp(_ n: Int) -> Int { min(max(n, 1), 8) }
        let patterns: [(String, Int)] = [
            (#"(\d{1,2})\s*[–-]\s*(\d{1,2})\s*sets?\b"#, 2),
            (#"(\d{1,2})\s*sets?\s*[×xX]"#, 1),
            (#"[—-]\s*(\d{1,2})\s*[×xX]\s*\d"#, 1),
            (#"\b(\d{1,2})\s*[×xX]\s*\d"#, 1),
            (#"(\d{1,2})\s*sets?\b"#, 1)
        ]
        for (pat, group) in patterns {
            if let r = try? NSRegularExpression(pattern: pat, options: .caseInsensitive),
               let m = r.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
               m.numberOfRanges > group,
               let range = Range(m.range(at: group), in: line),
               let n = Int(line[range]) {
                return clamp(n)
            }
        }
        return 3
    }

    static func stripNum(_ label: String) -> String {
        let stripped = label.replacingOccurrences(of: #"^\d+\.\s*"#, with: "", options: .regularExpression)
        return stripped.components(separatedBy: "—").first?.trimmingCharacters(in: .whitespaces) ?? stripped
    }

    static func ymd(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current
        return f.string(from: d)
    }

    static func occursOn(_ ev: HHEvent, _ d: Date) -> Bool {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let start = f.date(from: ev.starts_at) ?? {
            let g = ISO8601DateFormatter(); g.formatOptions = [.withInternetDateTime]
            return g.date(from: ev.starts_at) ?? Date.distantPast
        }()
        switch ev.recurrence ?? "" {
        case "daily": return start <= d
        case "weekly":
            let cal = Calendar.current
            return start <= d && cal.component(.weekday, from: start) == cal.component(.weekday, from: d)
        default:
            return ymd(start) == ymd(d)
        }
    }
}

// MARK: - Snapshot returned to the widget timeline

struct OpenItem {
    let eventId: String
    let eventTitle: String
    let eventKind: String    // "gym" | "meal" | "simple" — used to pick widget UI
    let allDay: Bool
    let startTime: Date
    let label: String        // stripped (no "1. ")
    let itemKey: String      // g0#0 / m1 / __done×__
    let setNum: Int          // 0 if not a gym set
    let totalSets: Int       // 0 if not a gym set
    let eventDone: Int
    let eventTotal: Int
    // Anchor: last logged set for this exercise on a previous day.
    // Nil for non-gym or first-time exercises.
    let lastSetWeight: String?
    let lastSetReps: String?
    let lastSetEffort: String?
}

struct UpcomingEvent {
    let title: String
    let startTime: Date
    let allDay: Bool
}

struct HHSnapshot {
    let dayKey: String
    let next: OpenItem?
    let totalDone: Int
    let totalAll: Int
    let eventCount: Int
    let streakDays: Int            // consecutive complete days ending today
    let nextUp: UpcomingEvent?     // the event AFTER state.next on today's list
}

enum HomeHubService {
    private static var defaultSession: URLSession {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 8
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: cfg)
    }

    static func get<T: Decodable>(_ path: String, _ query: String = "") async throws -> [T] {
        var comp = URLComponents(string: "\(HomeHubConfig.supabaseURL)/rest/v1/\(path)")!
        comp.percentEncodedQuery = query
        var req = URLRequest(url: comp.url!)
        req.setValue(HomeHubConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(HomeHubConfig.anonKey)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await defaultSession.data(for: req)
        return try JSONDecoder().decode([T].self, from: data)
    }

    static func upsertProgress(eventId: String, dayKey: String, itemKey: String,
                               done: Bool, skipped: Bool) async throws {
        var comp = URLComponents(string: "\(HomeHubConfig.supabaseURL)/rest/v1/progress")!
        comp.queryItems = [.init(name: "on_conflict", value: "event_id,log_date,item_key,user_id")]
        var req = URLRequest(url: comp.url!)
        req.httpMethod = "POST"
        req.setValue(HomeHubConfig.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(HomeHubConfig.anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
        let body: [String: Any] = [
            "event_id": eventId,
            "log_date": dayKey,
            "item_key": itemKey,
            "user_id": HomeHubConfig.user,
            "updated_at": ISO8601DateFormatter().string(from: Date()),
            "done": done,
            "skipped": skipped
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, resp) = try await defaultSession.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw NSError(domain: "HomeHub", code: http.statusCode,
                          userInfo: [NSLocalizedDescriptionKey: "upsert HTTP \(http.statusCode)"])
        }
    }

    static func loadSnapshot() async throws -> HHSnapshot {
        let today = Date()
        let dayKey = HomeHubParser.ymd(today)
        // Look back 30 days for streak + last-set computation.
        let sinceDate = Calendar.current.date(byAdding: .day, value: -30, to: today)!
        let sinceKey = HomeHubParser.ymd(sinceDate)
        async let events: [HHEvent] = get("events", "select=*")
        async let progress30: [ProgressRow] = get("progress", "select=*&log_date=gte.\(sinceKey)&user_id=eq.\(HomeHubConfig.user)")
        async let overrides: [GymOverride] = get("gym_override", "select=*&log_date=eq.\(dayKey)&user_id=eq.\(HomeHubConfig.user)")
        let (allEvents, allRecentProgress, allOverrides) = try await (events, progress30, overrides)
        // Today-only progress is a subset of the 30-day fetch.
        let allProgress = allRecentProgress.filter { $0.log_date == dayKey }

        let overrideEv: HHEvent? = allOverrides.first.flatMap { ov in
            allEvents.first { $0.id == ov.event_id }
        }
        var todays = allEvents.filter { HomeHubParser.occursOn($0, today) }
        if let ov = overrideEv {
            todays = todays.filter { $0.type != "gym" }
            todays.append(ov)
        }
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNF = ISO8601DateFormatter(); isoNF.formatOptions = [.withInternetDateTime]
        todays.sort { a, b in
            let da = iso.date(from: a.starts_at) ?? isoNF.date(from: a.starts_at) ?? .distantPast
            let db = iso.date(from: b.starts_at) ?? isoNF.date(from: b.starts_at) ?? .distantPast
            return da < db
        }

        var byEvent: [String: [String: ProgressRow]] = [:]
        for r in allProgress {
            byEvent[r.event_id, default: [:]][r.item_key] = r
        }
        func moved(_ r: ProgressRow?) -> Bool {
            (r?.done ?? false) || (r?.skipped ?? false)
        }
        func completion(_ parsed: ParsedEvent, _ p: [String: ProgressRow]) -> (Int, Int) {
            var done = 0, total = 0
            for g in parsed.groups {
                if g.sets > 0 {
                    total += g.sets
                    for s in 0..<g.sets { if moved(p["\(g.key)#\(s)"]) { done += 1 } }
                } else {
                    total += 1
                    if moved(p[g.key]) { done += 1 }
                }
            }
            return (done, total)
        }
        func firstOpen(_ parsed: ParsedEvent, _ p: [String: ProgressRow])
            -> (label: String, key: String, set: Int, totalSets: Int)? {
            for g in parsed.groups {
                if g.sets > 0 {
                    for s in 0..<g.sets {
                        let k = "\(g.key)#\(s)"
                        if !moved(p[k]) { return (HomeHubParser.stripNum(g.label), k, s + 1, g.sets) }
                    }
                } else if !moved(p[g.key]) {
                    return (g.label, g.key, 0, 0)
                }
            }
            return nil
        }

        var next: OpenItem? = nil
        var nextEventIdx: Int? = nil
        var totalDone = 0, totalAll = 0
        for (idx, e) in todays.enumerated() {
            let parsed = HomeHubParser.parse(e)
            let p = byEvent[e.id] ?? [:]
            let (d, t) = completion(parsed, p)
            totalDone += d; totalAll += t
            if next == nil, let open = firstOpen(parsed, p) {
                let start = iso.date(from: e.starts_at) ?? isoNF.date(from: e.starts_at) ?? Date()
                let kindStr: String
                switch parsed.kind {
                case .gym: kindStr = "gym"
                case .meal: kindStr = "meal"
                case .simple: kindStr = "simple"
                }
                // Last-set anchor for gym exercises: look back through past 30
                // days of progress on this exercise's group prefix (eg "g0#")
                // and return the most recent row with a weight.
                var lastWeight: String? = nil
                var lastReps: String? = nil
                var lastEffort: String? = nil
                if kindStr == "gym" {
                    let prefix = open.key.split(separator: "#").first.map(String.init) ?? ""
                    let candidates = allRecentProgress
                        .filter { $0.event_id == e.id
                            && $0.log_date != dayKey
                            && $0.item_key.hasPrefix("\(prefix)#")
                            && ($0.done ?? false) }
                        .sorted { $0.log_date > $1.log_date }
                    if let last = candidates.first(where: { ($0.weight ?? "").isEmpty == false }) {
                        lastWeight = last.weight
                        lastReps = last.reps
                        lastEffort = last.effort
                    }
                }
                next = OpenItem(eventId: e.id, eventTitle: e.title,
                                eventKind: kindStr,
                                allDay: e.all_day ?? false,
                                startTime: start,
                                label: open.label, itemKey: open.key,
                                setNum: open.set, totalSets: open.totalSets,
                                eventDone: d, eventTotal: t,
                                lastSetWeight: lastWeight,
                                lastSetReps: lastReps,
                                lastSetEffort: lastEffort)
                nextEventIdx = idx
            }
        }

        // What's the NEXT event on today's list (anticipation lever).
        var nextUp: UpcomingEvent? = nil
        if let idx = nextEventIdx, idx + 1 < todays.count {
            let n = todays[idx + 1]
            let start = iso.date(from: n.starts_at) ?? isoNF.date(from: n.starts_at) ?? Date()
            nextUp = UpcomingEvent(title: n.title, startTime: start,
                                   allDay: n.all_day ?? false)
        }

        // Streak: consecutive days ending today (with today's incomplete grace).
        let streakDays = computeStreak(events: allEvents, progress: allRecentProgress,
                                       today: today)

        return HHSnapshot(dayKey: dayKey, next: next,
                          totalDone: totalDone, totalAll: totalAll,
                          eventCount: todays.count,
                          streakDays: streakDays,
                          nextUp: nextUp)
    }

    // Walk backward from today, count consecutive days on which every scheduled
    // event was fully moved past (done OR skipped). Today's incompleteness is
    // a free pass — yesterday's state determines the streak.
    private static func computeStreak(events: [HHEvent],
                                      progress: [ProgressRow],
                                      today: Date) -> Int {
        let cal = Calendar.current
        var byDate: [String: [String: [String: ProgressRow]]] = [:]
        for r in progress {
            byDate[r.log_date, default: [:]][r.event_id, default: [:]][r.item_key] = r
        }
        func dayComplete(_ d: Date) -> Bool {
            let todays = events.filter { HomeHubParser.occursOn($0, d) }
            if todays.isEmpty { return false }
            let pd = byDate[HomeHubParser.ymd(d)] ?? [:]
            for e in todays {
                let parsed = HomeHubParser.parse(e)
                let p = pd[e.id] ?? [:]
                for g in parsed.groups {
                    if g.sets > 0 {
                        for s in 0..<g.sets {
                            let r = p["\(g.key)#\(s)"]
                            if !((r?.done ?? false) || (r?.skipped ?? false)) { return false }
                        }
                    } else {
                        let r = p[g.key]
                        if !((r?.done ?? false) || (r?.skipped ?? false)) { return false }
                    }
                }
            }
            return true
        }
        // Grace: if today is not complete, start counting from yesterday.
        var anchor = today
        if !dayComplete(anchor) {
            anchor = cal.date(byAdding: .day, value: -1, to: anchor)!
        }
        var count = 0
        var cur = anchor
        while dayComplete(cur) {
            count += 1
            cur = cal.date(byAdding: .day, value: -1, to: cur)!
        }
        return count
    }
}
