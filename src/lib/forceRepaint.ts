import { Capacitor } from '@capacitor/core';
import { ForceRedraw } from './forceRedrawNative';

// A React state update inside onPointerDown updates the DOM/className
// correctly and immediately (confirmed live: page content switches on the
// first tap) — but the tab button's own background-color repaint can still
// be deferred until an unrelated later touch forces a new frame. Only
// happens in standalone display mode (installed PWA and the Capacitor APK)
// — a regular mobile browser tab is unaffected.
//
// Diagnosed properly via chrome://inspect on the actual device (Galaxy
// S24+): the DOM/computed style are already correct AND Chrome's own
// compositor has already painted the correct frame (confirmed via
// Page.captureScreenshot showing the right colour at the exact moment the
// physical screen still showed the old one). That rules out every web-layer
// technique — the correct frame simply isn't being presented to the
// display, which is an Android View-level concern, not something
// JS/CSS/rAF can reach. On native Android this now calls a small Capacitor
// plugin (ForceRedrawPlugin) that explicitly invalidates the WebView's own
// Android View. The rAF + forced-reflow calls stay as a harmless fallback
// for web/other platforms, even though they were confirmed NOT sufficient
// for this specific standalone-mode bug on their own.
export function forceRepaint(el?: Element | null) {
  void (el ?? document.body).getBoundingClientRect().height;
  requestAnimationFrame(() => requestAnimationFrame(() => {}));
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    ForceRedraw.redraw().catch(() => {});
  }
}
