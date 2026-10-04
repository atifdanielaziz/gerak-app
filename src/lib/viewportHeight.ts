// iOS home-screen web app (standalone PWA) bug: after the on-screen keyboard
// closes, or after switching to another app (e.g. a WhatsApp link) and back,
// iOS can leave 100dvh stuck at the smaller "keyboard open" height and/or
// leave the page scrolled. The app shell then shrinks, so BottomNav floats
// mid-screen with a blank strip below it (reported live on a rider's iPhone
// on the Jubah Job Details page).
//
// Re-measure the real height (window.innerHeight) into --app-height, which
// .mobile-container uses on phones, and snap any leftover page scroll back
// to the top — the scroll reset never runs while an input is focused, so it
// can't fight the keyboard while someone is actually typing.

const isEditing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
};

// env(safe-area-inset-top) in px, read via a throwaway probe element.
function safeAreaTop(): number {
  if (!document.body) return 0;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

// Second iOS standalone quirk (index.html uses black-translucent +
// viewport-fit=cover): the app is drawn from the very top, under the
// status bar, yet innerHeight/100dvh report the screen height MINUS the
// status bar — so the shell ends that much short and BottomNav sits
// ~47pt too high (reported live on a driver's iPhone, Job Pool page).
// Only corrected when the shortfall matches the status-bar inset exactly,
// so Android, Safari tabs, iPad split view and desktop are never touched.
function appHeight(): number {
  const inner = window.innerHeight;
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return inner;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const top = safeAreaTop();
  return top > 0 && Math.abs(inner + top - full) <= 2 ? full : inner;
}

function sync() {
  // Height tracks innerHeight (corrected above for iOS standalone): on
  // Android (Capacitor adjustResize) that correctly shrinks with the
  // keyboard so focused inputs stay visible; on iOS innerHeight ignores the
  // keyboard, so it stays full.
  document.documentElement.style.setProperty('--app-height', `${appHeight()}px`);
  if (isEditing()) return;
  if (window.scrollY !== 0 || (window.visualViewport?.offsetTop ?? 0) !== 0) {
    window.scrollTo(0, 0);
  }
}

// iOS reports the final height a beat after the keyboard/app-switch
// animation, so check immediately and again once it has settled.
function syncSoon() {
  sync();
  window.setTimeout(sync, 350);
}

export function installViewportHeightFix() {
  sync();
  window.addEventListener('resize', syncSoon);
  window.addEventListener('orientationchange', syncSoon);
  window.addEventListener('pageshow', syncSoon);
  window.visualViewport?.addEventListener('resize', syncSoon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncSoon();
  });
  // Keyboard dismissed: focus leaves the input before iOS finishes resizing.
  document.addEventListener('focusout', syncSoon);
}
