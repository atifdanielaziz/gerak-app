import { useEffect, useRef } from 'react';

// Locks a touch gesture to its first dominant axis, like a spreadsheet.
// The root is the horizontal scroller; an optional descendant marked
// data-axis-y is the vertical scroller. When absent, the root handles both.
export const useAxisLockedScroll = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const horizontal = ref.current;
    if (!horizontal) return;
    const vertical = horizontal.querySelector<HTMLElement>('[data-axis-y]') ?? horizontal;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let axis: 'x' | 'y' | null = null;
    let releaseTimer: number | undefined;

    const clampCrossAxis = () => {
      if (axis === 'y' && horizontal.scrollLeft !== startLeft) horizontal.scrollLeft = startLeft;
      if (axis === 'x' && vertical.scrollTop !== startTop) vertical.scrollTop = startTop;
    };
    const onStart = (event: TouchEvent) => {
      window.clearTimeout(releaseTimer);
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = horizontal.scrollLeft;
      startTop = vertical.scrollTop;
      axis = null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (!axis && Math.max(dx, dy) >= 6) axis = dx > dy ? 'x' : 'y';
      clampCrossAxis();
    };
    const onEnd = () => {
      clampCrossAxis();
      releaseTimer = window.setTimeout(() => { axis = null; }, 450);
    };

    horizontal.addEventListener('touchstart', onStart, { passive: true });
    horizontal.addEventListener('touchmove', onMove, { passive: true });
    horizontal.addEventListener('touchend', onEnd, { passive: true });
    horizontal.addEventListener('touchcancel', onEnd, { passive: true });
    horizontal.addEventListener('scroll', clampCrossAxis, { passive: true });
    if (vertical !== horizontal) vertical.addEventListener('scroll', clampCrossAxis, { passive: true });
    return () => {
      window.clearTimeout(releaseTimer);
      horizontal.removeEventListener('touchstart', onStart);
      horizontal.removeEventListener('touchmove', onMove);
      horizontal.removeEventListener('touchend', onEnd);
      horizontal.removeEventListener('touchcancel', onEnd);
      horizontal.removeEventListener('scroll', clampCrossAxis);
      if (vertical !== horizontal) vertical.removeEventListener('scroll', clampCrossAxis);
    };
  }, []);

  return ref;
};
