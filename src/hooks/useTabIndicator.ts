import { useCallback, useLayoutEffect, useRef } from 'react';

// Positions a sliding indicator element under whichever tab button is
// currently active, via transform (translate + width/height) instead of
// each button toggling its own background-color className.
//
// Diagnosed live on Android/installed-PWA (Galaxy S24+, via
// chrome://inspect): background-color changes on the tab buttons
// sometimes didn't repaint until an unrelated later touch, confirmed
// across 7 separate fix attempts (transform-gpu, double rAF, forced
// reflow, native View invalidation, native visibility toggle, 1px
// scroll-and-back, a literal colour instead of a CSS variable) — none
// fixed it. But every screenshot taken during that diagnosis showed
// transform-based changes (the tap-scale animation) painting correctly
// every single time. Moving one shared indicator via transform sidesteps
// the bug instead of continuing to fight it.
// Repositions caused by mount-settling (fonts, safe-area insets, header
// content above the bar still loading in) jump instantly instead of
// animating — only a real, later tab switch should slide. Confirmed live:
// the very first measurement right after reopening the installed PWA can
// run before layout has fully settled, producing a collapsed/wrong size
// that never gets corrected because activeKey doesn't change again until
// the user taps something.
const SETTLE_WINDOW_MS = 600;

export function useTabIndicator<T extends HTMLElement = HTMLElement>(activeKey: string) {
  const containerRef = useRef<T | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const mountedAtRef = useRef<number | null>(null);

  const reposition = useCallback(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const btn = buttonRefs.current.get(activeKey);
    if (!container || !indicator || !btn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const x = btnRect.left - containerRect.left;
    const y = btnRect.top - containerRect.top;

    if (mountedAtRef.current === null) mountedAtRef.current = Date.now();
    const settling = Date.now() - mountedAtRef.current < SETTLE_WINDOW_MS;

    if (settling) indicator.style.transition = 'none';
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.height = `${btnRect.height}px`;
    indicator.style.transform = `translate(${x}px, ${y}px)`;
    if (settling) {
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }
  }, [activeKey]);

  useLayoutEffect(() => { reposition(); }, [reposition]);

  // Re-measure a few times during the settle window to catch layout that
  // finishes shifting after the first paint (web fonts, safe-area insets,
  // images/icons above the bar loading in) — each one still jumps instead
  // of animating, since they're all within SETTLE_WINDOW_MS of mount.
  useLayoutEffect(() => {
    const timers = [50, 150, 350, 600].map(ms => setTimeout(reposition, ms));
    document.fonts?.ready?.then(reposition).catch(() => {});
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, not re-run per activeKey change
  }, []);

  useLayoutEffect(() => {
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [reposition]);

  const setButtonRef = useCallback((key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttonRefs.current.set(key, el);
    else buttonRefs.current.delete(key);
  }, []);

  return { containerRef, indicatorRef, setButtonRef };
}
