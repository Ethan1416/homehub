// HomeHubApp.swift
//
// iOS: pure UIKit AppDelegate + SceneDelegate, no SwiftUI WindowGroup.
//      SwiftUI's WindowGroup creates an internal UIHostingController whose
//      view enforces safe-area on all descendants — that's why every modifier
//      I tried (ignoresSafeArea, statusBarHidden, additionalSafeAreaInsets,
//      Info.plist UIStatusBarHidden, frame overrides) couldn't get the
//      WKWebView to extend under the notch / home indicator. Bypassing the
//      SwiftUI host layer entirely is the only reliable fix.
//
// macOS: keep SwiftUI App — it works fine and doesn't have this issue.
import WebKit
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif
import SwiftUI
import WidgetKit

// MARK: - iOS app: pure UIKit, no SwiftUI host

#if os(iOS)

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ app: UIApplication,
                     didFinishLaunchingWithOptions opts: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }
    func application(_ app: UIApplication,
                     configurationForConnecting sess: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let cfg = UISceneConfiguration(name: nil, sessionRole: sess.role)
        cfg.delegateClass = SceneDelegate.self
        return cfg
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let win = UIWindow(windowScene: ws)
        win.rootViewController = WebHostController()
        self.window = win
        win.makeKeyAndVisible()
    }
}

/// WKWebView subclass that reports zero safe-area insets so the page's
/// `env(safe-area-inset-*)` resolves to 0 — content paints edge-to-edge.
final class FullBleedWebView: WKWebView {
    override var safeAreaInsets: UIEdgeInsets { .zero }
}

final class WebHostController: UIViewController {
    private(set) var webView: FullBleedWebView!

    // Status bar visible (so the user keeps time/battery) but the WebView
    // renders UNDER it via viewport-fit=cover. Same for the home indicator.
    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { false }

    override func loadView() {
        let container = UIView()
        container.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)

        // ── WKWebView config ──────────────────────────────────────────
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.allowsInlineMediaPlayback = true
        cfg.applicationNameForUserAgent = "Mobile/15E148 HomeHubApp/1.0"

        // Inject is-embedded-app class on <html> at document-start so the
        // PWA's CSS rules for the embedded shell take effect immediately.
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
        cfg.userContentController.addUserScript(
            WKUserScript(source: markerJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        // Clear caches so stale service-worker HTML can't override our class.
        WKWebsiteDataStore.default().removeData(
            ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
            modifiedSince: .distantPast) {}

        // ── The web view itself ───────────────────────────────────────
        let wv = FullBleedWebView(frame: .zero, configuration: cfg)
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.contentInset = .zero
        wv.scrollView.scrollIndicatorInsets = .zero
        wv.scrollView.verticalScrollIndicatorInsets = .zero
        wv.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        wv.scrollView.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        wv.isOpaque = false
        wv.allowsBackForwardNavigationGestures = true
        wv.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(wv)
        // ★ Pin to container edges (NOT safeAreaLayoutGuide). Container IS
        // the root view of a UIWindow that fills the full UIWindowScene,
        // so these edges go corner-to-corner of the device.
        NSLayoutConstraint.activate([
            wv.topAnchor.constraint(equalTo: container.topAnchor),
            wv.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            wv.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])

        self.webView = wv
        self.view = container

        wv.load(URLRequest(url: HomeHubConfig.appURL))
    }
}

#endif

// MARK: - macOS app: SwiftUI WindowGroup

#if os(macOS)

@main
struct HomeHubMacApp: App {
    var body: some Scene {
        WindowGroup { MacContentView() }
            .defaultSize(width: 480, height: 360)
    }
}

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

// MARK: - Shared splash visual (used by macOS; kept available if iOS wants it)

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
                                           startPoint: .topLeading, endPoint: .bottomTrailing)
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
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08))
                    Capsule()
                        .fill(LinearGradient(colors: [burn, heat],
                                             startPoint: .leading, endPoint: .trailing))
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
