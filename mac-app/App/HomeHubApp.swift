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
        HomeHubWebView(loaded: $loaded)
            .ignoresSafeArea(.all, edges: .all)
            .persistentSystemOverlays(.hidden)
            .statusBarHidden(true)
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
            // renders to the device edges. Also zero out env(safe-area-inset-*)
            // padding the PWA may have, since iOS reports these inside our
            // embedded WKWebView too.
            let js = """
            (function(){
              var m = document.querySelector('meta[name=viewport]');
              if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
              m.setAttribute('content',
                'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no');
              var s = document.createElement('style');
              s.innerHTML = `
                html, body, #root, #__next {
                  margin: 0 !important; padding: 0 !important;
                  min-height: 100vh !important; min-height: 100dvh !important;
                  height: 100% !important;
                  background: #0e1117 !important;
                }
                /* Strip the PWA's env(safe-area-inset-*) padding — when
                   embedded in our app the WKWebView already extends edge-to-
                   edge, so the PWA-side safe-area gaps create double-black
                   spacing. Override every selector that uses env() with a
                   value that doesn't reference env(). */
                .ph {
                  padding: 22px 22px 0 !important;
                }
                .ph-top {
                  margin: -22px -22px 16px !important;
                  padding: 14px 18px 14px !important;
                }
                .ph-head {
                  padding: 20px 20px 14px !important;
                }
                .phone {
                  padding-bottom: 0 !important;
                }
                .tab-content {
                  padding-bottom: 96px !important;
                }
                .grid-bottom {
                  padding-bottom: 86px !important;
                }
                .fab {
                  bottom: 86px !important;
                }
                /* The actual tab bar selector in this PWA is .tabbar — it
                   adds env(safe-area-inset-bottom) padding which leaves the
                   black gap under it. Force fixed inner padding. */
                .tabbar {
                  padding: 8px 18px 10px !important;
                }
                nav, footer, [class*="bottom-bar"], [class*="bottom-nav"] {
                  padding-bottom: 10px !important;
                }
                body { overscroll-behavior: none; }
              `;
              document.head.appendChild(s);
              // Add a viewport-fit=cover follow-up tick — some PWAs swap the
              // meta back in after their JS runs.
              setTimeout(function(){ m.setAttribute('content',
                'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no'); }, 400);
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

/// Subclass that forces zero safe-area insets, so env(safe-area-inset-*) in
/// CSS resolves to 0px and the page renders edge-to-edge.
final class FullBleedWebView: WKWebView {
    override var safeAreaInsets: UIEdgeInsets { .zero }
}

final class WebHostController: UIViewController {
    var coordinator: HomeHubWebView.Coordinator?
    private(set) var webView: WKWebView!

    override var prefersHomeIndicatorAutoHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // Bypass SwiftUI's safe-area clipping entirely by sizing the web view
    // against the window's screen bounds instead of self.view bounds.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let webView = webView else { return }
        let target: CGRect
        if let window = view.window {
            target = view.convert(window.bounds, from: window)
        } else {
            target = view.bounds
        }
        if webView.frame != target {
            webView.frame = target
        }
    }

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.allowsInlineMediaPlayback = true
        cfg.applicationNameForUserAgent = "Mobile/15E148 HomeHubApp/1.0"

        // Mark this run as "embedded in native shell" by adding a class on
        // <html>. The PWA's stylesheet has matching `html.is-embedded-app`
        // rules that drop safe-area padding (more reliable than fighting
        // PWA selectors with !important overrides from outside).
        let markerJS = """
        (function(){
          function add() {
            if (document.documentElement) {
              document.documentElement.classList.add('is-embedded-app');
              return true;
            }
            return false;
          }
          if (!add()) {
            var obs = new MutationObserver(function(){ if (add()) obs.disconnect(); });
            obs.observe(document, { childList: true, subtree: true });
          }
          window.__hhAppInjected = true;
        })();
        """
        let userScript = WKUserScript(source: markerJS,
                                      injectionTime: .atDocumentStart,
                                      forMainFrameOnly: true)
        cfg.userContentController.addUserScript(userScript)

        // DEBUG: clear all WebKit caches on launch so service worker / HTTP
        // cache can't serve stale HTML or CSS while we're iterating. Remove
        // once layout is stable.
        let dataStore = WKWebsiteDataStore.default()
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        dataStore.removeData(ofTypes: types, modifiedSince: .distantPast) {}

        let wv = FullBleedWebView(frame: .zero, configuration: cfg)
        wv.navigationDelegate = coordinator
        wv.scrollView.bounces = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.contentInset = .zero
        wv.scrollView.scrollIndicatorInsets = .zero
        wv.scrollView.verticalScrollIndicatorInsets = .zero
        // DEBUG: neon yellow WKWebView background — if yellow appears in the
        // safe-area gaps, the WebView itself fills full screen and only the
        // PWA content is clipped. If no yellow, WebView itself is clipped.
        wv.backgroundColor = UIColor.yellow
        wv.scrollView.backgroundColor = UIColor.yellow
        wv.isOpaque = false
        wv.allowsBackForwardNavigationGestures = true
        wv.translatesAutoresizingMaskIntoConstraints = false
        self.webView = wv

        // Use a container view as the controller's root so UIKit's automatic
        // safe-area inset on the root view doesn't get applied directly to the
        // WKWebView. The WKWebView is pinned to the CONTAINER's edges (not
        // its safe area), so it fills the entire screen including under the
        // notch and home indicator.
        // Use no constraints — viewDidLayoutSubviews sizes webView against the
        // UIWindow's bounds directly, bypassing SwiftUI's safe-area clipping.
        wv.translatesAutoresizingMaskIntoConstraints = true

        let container = UIView()
        container.backgroundColor = UIColor.yellow  // any leak → easy to spot
        container.addSubview(wv)
        self.view = container

        wv.load(URLRequest(url: HomeHubConfig.appURL))
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
