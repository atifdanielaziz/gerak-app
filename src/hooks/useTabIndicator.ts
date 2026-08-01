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
export function useTabIndicator<T extends HTMLElement = HTMLElement>(activeKey: string) {
  const containerRef = useRef<T | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const mountedRef = useRef(false);

  const reposition = useCallback(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const btn = buttonRefs.current.get(activeKey);
    if (!container || !indicator || !btn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const x = btnRect.left - containerRect.left;
    const y = btnRect.top - containerRect.top;

    // First placement shouldn't animate in from the top-left corner —
    // jump straight there, then re-enable the transition for every
    // subsequent tab change.
    if (!mountedRef.current) indicator.style.transition = 'none';
    indicator.style.width = `${btnRect.width}px`;
    indicator.style.height = `${btnRect.height}px`;
    indicator.style.transform = `translate(${x}px, ${y}px)`;
    if (!mountedRef.current) {
      void indicator.offsetWidth;
      indicator.style.transition = '';
      mountedRef.current = true;
    }
  }, [activeKey]);

  useLayoutEffect(() => { reposition(); }, [reposition]);

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
