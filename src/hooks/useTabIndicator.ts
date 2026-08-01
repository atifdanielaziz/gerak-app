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
// No CSS transition at all — every reposition is an instant snap.
// Confirmed live via chrome://inspect: even with the sliding-indicator
// approach (transform, not background-color), the DOM/computed state was
// provably correct immediately after a tap (right size, right position)
// while the physical screen still showed the old, wrong frame — the exact
// same class of bug, just on a JS-driven transform instead of a
// JS-driven background-color. Testing whether the animated CSS
// transition itself (a distinct animation-timeline code path in the
// engine) is what's interacting badly with the repaint scheduler on this
// device, separate from which property is changing.
export function useTabIndicator<T extends HTMLElement = HTMLElement>(activeKey: string) {
  const containerRef = useRef<T | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const reposition = useCallback(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const btn = buttonRefs.current.get(activeKey);
    if (!container || !indicator || !btn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const x = btnRect.left - containerRect.left;
    const y = btnRect.top - containerRect.top;

    indicator.style.width = `${btnRect.width}px`;
    indicator.style.height = `${btnRect.height}px`;
    indicator.style.transform = `translate(${x}px, ${y}px)`;
  }, [activeKey]);

  useLayoutEffect(() => { reposition(); }, [reposition]);

  // Re-measure a few times after mount to catch layout that finishes
  // shifting after the first paint (web fonts, safe-area insets,
  // images/icons above the bar loading in) — no transition to worry
  // about now, so these are just as instant as any other reposition.
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
