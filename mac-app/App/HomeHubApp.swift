// HomeHubApp.swift
// Minimal host app. Its only real job is to ship the widget extension
// inside its .app bundle so macOS / iOS can register it.
import SwiftUI
import WidgetKit

@main
struct HomeHubApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        #if os(macOS)
        .defaultSize(width: 480, height: 360)
        #endif
    }
}

struct ContentView: View {
    @State private var snapshot: HHSnapshot? = nil
    @State private var loading = false
    @State private var error: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("HomeHub")
                .font(.system(size: 24, weight: .heavy))
            Text("This app hosts the HomeHub home-screen / desktop widget. Add it via your widget gallery.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)

            Divider()

            if let s = snapshot {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Today").font(.headline)
                        Spacer()
                        Text("\(s.totalDone)/\(s.totalAll)")
                            .foregroundStyle(.secondary)
                    }
                    if let n = s.next {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(n.eventTitle).font(.system(size: 15, weight: .semibold))
                            Text("Next: \(n.label)\(n.totalSets > 0 ? " — set \(n.setNum)/\(n.totalSets)" : "")")
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                        }
                        .padding(10)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
                    } else {
                        Text(s.eventCount == 0 ? "Nothing scheduled today." : "All done today 🎉")
                            .foregroundStyle(.secondary)
                    }
                }
            } else if let err = error {
                Text(err).foregroundStyle(.red).font(.system(size: 12, design: .monospaced))
            } else if loading {
                ProgressView()
            }

            Spacer()

            HStack {
                Button {
                    Task { await reload() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                Spacer()
                Button {
                    WidgetCenter.shared.reloadAllTimelines()
                } label: {
                    Label("Reload widget timelines", systemImage: "rectangle.on.rectangle.angled")
                }
            }
        }
        .padding(20)
        .task { await reload() }
    }

    @MainActor
    private func reload() async {
        loading = true; error = nil
        do {
            snapshot = try await HomeHubService.loadSnapshot()
        } catch {
            self.error = "\(error)"
        }
        loading = false
    }
}
