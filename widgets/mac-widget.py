#!/usr/bin/env /usr/bin/python3
# HomeHub desktop widget for macOS — a real floating window.
#
# Uses pyobjc + WKWebView to render the same interactive UI as the iOS
# widget (✓ done / ↷ skip / center-tap to open PWA). The window:
#   • floats above other apps (NSFloatingWindowLevel)
#   • has no title bar / dock icon — looks like a desktop widget
#   • is draggable from anywhere
#   • clicks on ✓ and ↷ fire real Supabase upserts (same as the iOS widget)
#
# Run:    python3 widgets/mac-widget.py
# Quit:   ⌘Q while focused, or kill the process.
import os, signal, sys
from pathlib import Path

import objc
from Cocoa import (
    NSApplication, NSWindow, NSWindowController, NSColor, NSScreen, NSEvent,
    NSObject, NSMenu, NSMenuItem, NSApp, NSWindowStyleMaskBorderless,
    NSBackingStoreBuffered, NSFloatingWindowLevel, NSStatusWindowLevel,
    NSApplicationActivationPolicyAccessory,
)
from WebKit import WKWebView, WKWebViewConfiguration, WKPreferences
from Foundation import NSURL, NSURLRequest, NSMakeRect, NSMakeSize, NSMakePoint

HTML_PATH = str(Path(__file__).resolve().parent / 'mac-test.html')
WIDTH, HEIGHT = 380, 560


class DraggableWindow(NSWindow):
    # Borderless windows aren't normally draggable. We accept any mouse-down
    # in the background and call performWindowDragWithEvent_.
    def canBecomeKeyWindow(self):
        return True
    def canBecomeMainWindow(self):
        return True
    def mouseDown_(self, event):
        # objc bridge for [self performWindowDragWithEvent:event]
        self.performWindowDragWithEvent_(event)


class AppDelegate(NSObject):
    def applicationDidFinishLaunching_(self, _):
        screen = NSScreen.mainScreen().visibleFrame()
        # Position in the top-right corner, ~30px from edges
        x = screen.origin.x + screen.size.width - WIDTH - 30
        y = screen.origin.y + screen.size.height - HEIGHT - 30
        rect = NSMakeRect(x, y, WIDTH, HEIGHT)

        win = DraggableWindow.alloc().initWithContentRect_styleMask_backing_defer_(
            rect, NSWindowStyleMaskBorderless, NSBackingStoreBuffered, False
        )
        win.setBackgroundColor_(NSColor.colorWithCalibratedRed_green_blue_alpha_(
            0.055, 0.066, 0.090, 1.0))  # #0e1117 widget bg
        win.setOpaque_(False)
        win.setHasShadow_(True)
        win.setMovableByWindowBackground_(True)
        win.setLevel_(NSStatusWindowLevel)  # above almost everything
        win.setReleasedWhenClosed_(False)
        win.setTitle_('HomeHub')

        config = WKWebViewConfiguration.alloc().init()
        prefs = WKPreferences.alloc().init()
        config.setPreferences_(prefs)
        # Enable JS / let it talk to Supabase
        try:
            config.preferences().setValue_forKey_(True, 'allowFileAccessFromFileURLs')
        except Exception:
            pass

        webview = WKWebView.alloc().initWithFrame_configuration_(
            NSMakeRect(0, 0, WIDTH, HEIGHT), config
        )
        webview.setValue_forKey_(False, 'drawsBackground')

        url = NSURL.fileURLWithPath_(HTML_PATH)
        req = NSURLRequest.requestWithURL_(url)
        webview.loadFileURL_allowingReadAccessToURL_(url, NSURL.fileURLWithPath_(str(Path(HTML_PATH).parent)))

        win.contentView().addSubview_(webview)
        win.makeKeyAndOrderFront_(None)
        self._win = win
        self._webview = webview

        # Minimal menu so ⌘Q works
        menubar = NSMenu.alloc().init()
        app_menu_item = NSMenuItem.alloc().init()
        menubar.addItem_(app_menu_item)
        app_menu = NSMenu.alloc().init()
        quit_item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
            'Quit HomeHub', 'terminate:', 'q')
        app_menu.addItem_(quit_item)
        app_menu_item.setSubmenu_(app_menu)
        NSApp.setMainMenu_(menubar)

        NSApp.activateIgnoringOtherApps_(True)


def main():
    signal.signal(signal.SIGINT, lambda *_: os._exit(0))
    app = NSApplication.sharedApplication()
    # Accessory = no dock icon, no force-focus
    app.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
    delegate = AppDelegate.alloc().init()
    app.setDelegate_(delegate)
    app.run()


if __name__ == '__main__':
    main()
