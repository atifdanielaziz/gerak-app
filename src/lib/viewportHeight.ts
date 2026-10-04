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

function sync() {
  // Height always tracks innerHeight: on Android (Capacitor adjustResize)
  // that correctly shrinks with the keyboard so focused inputs stay
  // visible; on iOS innerHeight ignores the keyboard, so it stays full.
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
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
