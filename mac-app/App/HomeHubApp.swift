// HomeHubApp.swift
// The native HomeHub app exists primarily to host the widget extension. On
// launch (e.g. if the user taps the widget without an explicit .widgetURL
// landing first), it immediately redirects to the real HomeHub PWA in Safari
// so the user always ends up in the right place.
import SwiftUI
import WidgetKit
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

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
    @State private var didRedirect = false

    var body: some View {
        VStack(spacing: 16) {
            Text("HomeHub")
                .font(.system(size: 28, weight: .heavy))
            Text("Opening HomeHub…")
                .foregroundStyle(.secondary)
            Button {
                openPWA()
            } label: {
                Label("Open HomeHub", systemImage: "arrow.up.forward.app")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            guard !didRedirect else { return }
            didRedirect = true
            // Tiny delay so iOS gets to finish animating the app launch
            // before we hand off to Safari.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                openPWA()
            }
        }
    }

    private func openPWA() {
        let url = HomeHubConfig.appURL
        #if canImport(UIKit)
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        #elseif canImport(AppKit)
        NSWorkspace.shared.open(url)
        #endif
    }
}
