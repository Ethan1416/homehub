// HomeHubApp.swift
// Native HomeHub host app. iOS variant embeds the PWA in a WKWebView with a
// branded loading screen — so widget taps land "in the app" rather than in
// Safari. macOS variant just opens the PWA in the user's browser.
import SwiftUI
import WidgetKit
#if canImport(UIKit)
import UIKit
import WebKit
#elseif canImport(AppKit)
import AppKit
#endif

@main
struct HomeHubApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                #if os(iOS)
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 480, height: 360)
        #endif
    }
}

struct ContentView: View {
    var body: some View {
        #if os(iOS)
        EmbeddedAppView()
        #else
        MacContentView()
        #endif
    }
}

// MARK: - iOS: WKWebView wrapping the PWA, with a branded splash

#if os(iOS)

struct EmbeddedAppView: View {
    @State private var loaded = false

    var body: some View {
        ZStack {
            // PWA (always loading underneath the splash)
            HomeHubWebView(loaded: $loaded)
                .ignoresSafeArea()
                .opacity(loaded ? 1 : 0)

            // Splash on top until the page finishes loading
            if !loaded {
                SplashView()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.35), value: loaded)
    }
}

struct HomeHubWebView: UIViewRepresentable {
    @Binding var loaded: Bool

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()  // persist cookies / localStorage
        cfg.allowsInlineMediaPlayback = true

        let view = WKWebView(frame: .zero, configuration: cfg)
        view.navigationDelegate = context.coordinator
        view.scrollView.bounces = true
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        view.isOpaque = false
        view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url: HomeHubConfig.appURL))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(loaded: $loaded) }

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var loaded: Bool
        init(loaded: Binding<Bool>) { _loaded = loaded }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Tiny pause so the page paints before we cross-fade
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                self.loaded = true
            }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            // Don't get stuck on splash forever if offline
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.loaded = true }
        }
    }
}

#endif

// MARK: - Splash (shared)

struct SplashView: View {
    @State private var progress: CGFloat = 0
    @State private var pulseLogo = false

    private let bgBase = Color(.sRGB, red: 0.063, green: 0.075, blue: 0.114, opacity: 1)
    private let bgDeep = Color(.sRGB, red: 0.027, green: 0.035, blue: 0.059, opacity: 1)
    private let heat = Color(.sRGB, red: 0.988, green: 0.298, blue: 0.008, opacity: 1)
    private let heatSoft = Color(.sRGB, red: 1.0, green: 0.478, blue: 0.227, opacity: 1)
    private let burn = Color(.sRGB, red: 0.961, green: 0.627, blue: 0.176, opacity: 1)
    private let muted = Color(.sRGB, red: 0.541, green: 0.565, blue: 0.659, opacity: 1)

    var body: some View {
        ZStack {
            // Backdrop — matches widget
            LinearGradient(colors: [bgBase, bgDeep],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            RadialGradient(
                gradient: Gradient(colors: [heat.opacity(0.25), .clear]),
                center: .bottomTrailing,
                startRadius: 0, endRadius: 500
            )
                .ignoresSafeArea()

            VStack(spacing: 28) {
                Spacer()

                // Logo — dumbbell behind a flame motif
                ZStack {
                    Circle()
                        .fill(heat.opacity(0.12))
                        .frame(width: 130, height: 130)
                        .blur(radius: 24)
                        .scaleEffect(pulseLogo ? 1.15 : 1.0)
                    Image(systemName: "dumbbell.fill")
                        .font(.system(size: 60, weight: .heavy))
                        .foregroundStyle(
                            LinearGradient(colors: [heatSoft, heat],
                                           startPoint: .topLeading,
                                           endPoint: .bottomTrailing)
                        )
                        .shadow(color: heat.opacity(0.5), radius: 16, y: 6)
                        .rotationEffect(.degrees(-15))
                }
                .frame(height: 130)

                VStack(spacing: 4) {
                    Text("HOMEHUB")
                        .font(.system(size: 22, weight: .black))
                        .tracking(6)
                        .foregroundStyle(.white)
                    Text("LOADING TODAY'S SESSION")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(2)
                        .foregroundStyle(muted)
                }

                Spacer()

                // Progress bar — sweeps left-to-right, repeats
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.08))
                    Capsule()
                        .fill(LinearGradient(colors: [burn, heat],
                                             startPoint: .leading,
                                             endPoint: .trailing))
                        .frame(width: 88 * progress)
                        .shadow(color: heat.opacity(0.7), radius: 6)
                }
                .frame(width: 200, height: 4)
                .padding(.bottom, 60)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                pulseLogo = true
            }
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) {
                progress = 1
            }
        }
    }
}

// MARK: - macOS

#if os(macOS)
struct MacContentView: View {
    var body: some View {
        ZStack {
            SplashView()
            VStack {
                Spacer()
                Button {
                    NSWorkspace.shared.open(HomeHubConfig.appURL)
                } label: {
                    Label("Open in browser", systemImage: "arrow.up.forward.app")
                        .font(.system(size: 13, weight: .semibold))
                }
                .padding(.bottom, 24)
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                NSWorkspace.shared.open(HomeHubConfig.appURL)
            }
        }
    }
}
#endif
