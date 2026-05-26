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
            // Solid behind-the-webview backdrop so any safe-area gap (status bar /
            // home indicator) bleeds the right color, not white.
            Color(.sRGB, red: 0.055, green: 0.066, blue: 0.090, opacity: 1)
                .ignoresSafeArea()

            // PWA — explicit full-screen frame, ignores ALL safe areas.
            HomeHubWebView(loaded: $loaded)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(.all, edges: .all)
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

// Use UIViewControllerRepresentable instead of UIViewRepresentable so we can
// override the view controller's safe-area insets to zero — the only way to
// get the WKWebView's render area to extend under the status bar and home
// indicator without SwiftUI's safe-area machinery clipping it.
struct HomeHubWebView: UIViewControllerRepresentable {
    @Binding var loaded: Bool

    func makeUIViewController(context: Context) -> WebHostController {
        let vc = WebHostController()
        vc.coordinator = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: WebHostController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(loaded: $loaded) }

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var loaded: Bool
        init(loaded: Binding<Bool>) { _loaded = loaded }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Inject aggressive CSS + viewport-fit=cover so the PWA actually
            // renders all the way to the device edges (under the notch/home bar).
            let js = """
            (function(){
              var m = document.querySelector('meta[name=viewport]');
              if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
              m.setAttribute('content',
                'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no');
              var s = document.createElement('style');
              s.innerHTML = `
                html, body, #root {
                  margin: 0 !important; padding: 0 !important;
                  min-height: 100vh !important; min-height: 100dvh !important;
                  height: 100% !important;
                  background: #0e1117 !important;
                }
                body { overscroll-behavior: none; }
              `;
              document.head.appendChild(s);
            })();
            """
            webView.evaluateJavaScript(js) { _, _ in }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                self.loaded = true
            }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.loaded = true }
        }
    }
}

final class WebHostController: UIViewController {
    var coordinator: HomeHubWebView.Coordinator?
    private(set) var webView: WKWebView!

    override var prefersHomeIndicatorAutoHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // ★ The key override: drop ALL safe-area insets so child views (the
    //   WKWebView) fill the entire bounds, edge to edge.
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        additionalSafeAreaInsets = UIEdgeInsets(
            top: -view.safeAreaInsets.top + additionalSafeAreaInsets.top,
            left: 0, bottom: -view.safeAreaInsets.bottom + additionalSafeAreaInsets.bottom,
            right: 0)
    }

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.allowsInlineMediaPlayback = true
        cfg.applicationNameForUserAgent = "Mobile/15E148 HomeHubApp/1.0"

        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.navigationDelegate = coordinator
        wv.scrollView.bounces = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.contentInset = .zero
        wv.scrollView.scrollIndicatorInsets = .zero
        wv.scrollView.verticalScrollIndicatorInsets = .zero
        wv.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        wv.scrollView.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        wv.isOpaque = false
        wv.allowsBackForwardNavigationGestures = true
        wv.translatesAutoresizingMaskIntoConstraints = true
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        wv.load(URLRequest(url: HomeHubConfig.appURL))
        self.webView = wv
        self.view = wv
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
