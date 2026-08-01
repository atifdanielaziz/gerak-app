// A React state update inside onPointerDown updates the DOM/className
// correctly and immediately (confirmed live: page content switches on the
// first tap) — but the tab button's own background-color repaint can still
// be deferred until an unrelated later touch forces a new frame. Narrowed
// down live: this only happens in standalone display mode (installed PWA
// and the Capacitor APK) — a regular mobile browser tab is unaffected, and
// a first double-requestAnimationFrame attempt alone did NOT fix it there.
// Mobile browsers are known to throttle/skip repaints to save power when
// running standalone with no continuous animation in flight — reading a
// layout property back synchronously forces the engine to flush any
// pending style/layout work immediately, rather than leaving it queued for
// whenever it next decides a repaint is worth the battery cost. Combined
// with the double rAF (forces two real paint cycles to actually run) as a
// second layer, since neither technique alone had been confirmed to work
// in isolation.
export function forceRepaint(el?: Element | null) {
  void (el ?? document.body).getBoundingClientRect().height;
  requestAnimationFrame(() => requestAnimationFrame(() => {}));
}
