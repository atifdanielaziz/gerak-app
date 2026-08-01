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
// Needs to work on both the installed PWA and the Capacitor APK, so this
// stays pure DOM/JS — no native bridge involved (a native visibility-toggle
// attempt was tried and reverted: it caused a visible black flash, since
// toggling the WebView invisible briefly exposes the window's blank
// background, and it still didn't fix the actual colour bug either).
//
// A 1px scroll-and-back: scroll gestures get the highest compositor
// priority on virtually every mobile browser engine, tied directly to the
// touch/gesture recognizer that's guaranteed to trigger a fresh frame.
export function forceRepaint(el?: Element | null) {
  void (el ?? document.body).getBoundingClientRect().height;
  requestAnimationFrame(() => requestAnimationFrame(() => {}));

  window.scrollBy(0, 1);
  requestAnimationFrame(() => window.scrollBy(0, -1));
}
