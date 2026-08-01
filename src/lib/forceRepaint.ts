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
// physical screen still showed the old one). That rules out every plain
// web-layer technique — the correct frame simply isn't being presented to
// the display.
//
// This needs to work on BOTH the installed PWA (pure web, no native bridge
// at all — a Capacitor plugin call is a no-op there) and the Capacitor APK
// (a real native shell), so two independent techniques run together:
//
// 1. A 1px scroll-and-back. Scroll gestures get the highest compositor
//    priority on virtually every mobile browser engine (they're tied
//    directly to the touch/gesture recognizer that's guaranteed to trigger
//    a fresh frame) — this is pure DOM/JS, so it's the only lever available
//    to the installed PWA, which has no native code to call into at all.
// 2. On native Android specifically, also call the local ForceRedrawPlugin,
//    which toggles the WebView's own Android View visibility off and back
//    on — forceful enough to make the window manager recompute the whole
//    surface stack, not just ask the WebView to redraw itself.
export function forceRepaint(el?: Element | null) {
  void (el ?? document.body).getBoundingClientRect().height;
  requestAnimationFrame(() => requestAnimationFrame(() => {}));

  window.scrollBy(0, 1);
  requestAnimationFrame(() => window.scrollBy(0, -1));

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    ForceRedraw.redraw().catch(() => {});
  }
}
