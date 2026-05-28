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
        let win = NoSafeAreaWindow(windowScene: ws)
        win.frame = ws.screen.bounds
        win.rootViewController = WebHostController()
        self.window = win
        win.makeKeyAndVisible()
    }
}

/// UIWindow subclass that reports zero safe-area insets AND forces the root
/// view controller's view to span the entire window after every layout pass.
/// This defeats UIKit's automatic resizing of rootViewController.view to fit
/// the safe area on iOS 18.
final class NoSafeAreaWindow: UIWindow {
    override var safeAreaInsets: UIEdgeInsets { .zero }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Force the root view to match our bounds exactly. UIKit's default
        // behaviour on iOS 18 is to inset rootViewController.view by the
        // safe-area top (status bar) and bottom (home indicator), which is
        // what was creating the black bars.
        if let rootView = rootViewController?.view, rootView.frame != bounds {
            rootView.frame = bounds
        }
    }
}

/// UIView subclass returning zero safe-area insets.
final class NoSafeAreaView: UIView {
    override var safeAreaInsets: UIEdgeInsets { .zero }
}

/// WKWebView subclass that reports zero safe-area insets so the page's
/// `env(safe-area-inset-*)` resolves to 0 — content paints edge-to-edge.
final class FullBleedWebView: WKWebView {
    override var safeAreaInsets: UIEdgeInsets { .zero }
}

final class WebHostController: UIViewController, WKNavigationDelegate {
    private(set) var webView: FullBleedWebView!

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    // Force-frame on every layout pass against the WINDOW bounds (not our
    // view.bounds, which UIKit shrinks to safe area).
    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        forceFullScreen()
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        forceFullScreen()
    }
    private func forceFullScreen() {
        guard let win = view.window else { return }
        let target = win.bounds
        if view.frame != target { view.frame = target }
        if let wv = webView, wv.frame != target { wv.frame = target }
    }

    override func loadView() {
        let container = NoSafeAreaView()
        container.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)

        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.allowsInlineMediaPlayback = true
        // Default content mode (.recommended) — `.mobile` was forcing a
        // 320×480 legacy viewport. Without it, WebKit picks viewport size
        // from the WKWebView's actual frame width.
        cfg.defaultWebpagePreferences.preferredContentMode = .recommended

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
        WKWebsiteDataStore.default().removeData(
            ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
            modifiedSince: .distantPast) {}

        let wv = FullBleedWebView(frame: .zero, configuration: cfg)
        // ★ Spoof full Safari UA so the page (and WebKit itself) treats us
        // like Mobile Safari. Without "Safari/X.X.X" suffix WebKit falls back
        // to compat 320×480 viewport.
        wv.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        wv.navigationDelegate = self
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.scrollView.contentInset = .zero
        wv.scrollView.scrollIndicatorInsets = .zero
        wv.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        wv.scrollView.backgroundColor = UIColor(red: 0.055, green: 0.066, blue: 0.090, alpha: 1)
        wv.isOpaque = false
        wv.allowsBackForwardNavigationGestures = true
        wv.translatesAutoresizingMaskIntoConstraints = true
        wv.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        container.addSubview(wv)
        self.webView = wv
        self.view = container
        wv.frame = container.bounds
        // ★ Load URL in viewDidAppear instead of loadView — WebKit determines
        // the viewport metrics at load() time. If we load while view.frame is
        // .zero, it falls back to legacy 320×480 viewport. Loading after the
        // view has real bounds means viewport = device width.
    }

    private var didLoad = false
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didLoad else { return }
        didLoad = true
        webView.load(URLRequest(url: HomeHubConfig.appURL))
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
