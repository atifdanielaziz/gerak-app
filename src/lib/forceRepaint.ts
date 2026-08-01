// A React state update inside onPointerDown updates the DOM/className
// correctly and immediately (confirmed live: page content switches on the
// first tap) — but on Android's Chromium WebView, the tab button's own
// background-color repaint can still be deferred by the compositor until
// an unrelated later touch forces a new frame (confirmed live: the tab
// stays unstyled until a different tab is tapped, at which point the
// PREVIOUS tab's color finally appears). transform-gpu (layer promotion)
// already fixed this exact class of bug on iOS Safari/WebKit, but isn't
// sufficient for this Chromium quirk on its own.
//
// Scheduling two nested requestAnimationFrame callbacks forces the browser
// to actually run two full paint cycles before this function's promise
// resolves — a widely-used technique for nudging an engine to flush a
// pending-but-not-yet-committed repaint instead of leaving it queued
// indefinitely.
export function forceRepaint() {
  requestAnimationFrame(() => requestAnimationFrame(() => {}));
}
