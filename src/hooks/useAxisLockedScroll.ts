import { useEffect, useRef } from 'react';

// Table Standard scroll engine. The card itself never moves: the root is
// the horizontal scroller and the optional data-axis-y child is vertical.
// We manually apply each touch/wheel gesture to one dominant axis. Merely
// resetting the cross-axis after native scrolling is not enough on iOS:
// WebKit can keep an unwanted diagonal momentum animation alive after the
// finger lifts, producing the "wide drift" this hook exists to prevent.
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
    const previousTouchAction = horizontal.style.touchAction;
    horizontal.style.touchAction = 'none';

    const onStart = (event: TouchEvent) => {
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
      const moveX = touch.clientX - startX;
      const moveY = touch.clientY - startY;
      const dx = Math.abs(moveX);
      const dy = Math.abs(moveY);
      if (!axis && Math.max(dx, dy) >= 6) axis = dx > dy ? 'x' : 'y';
      if (!axis) return;

      // Cancels WebKit's native two-axis pan and its post-release momentum.
      event.preventDefault();
      if (axis === 'x') {
        horizontal.scrollLeft = startLeft - moveX;
        vertical.scrollTop = startTop;
      } else {
        vertical.scrollTop = startTop - moveY;
        horizontal.scrollLeft = startLeft;
      }
    };
    const onEnd = () => { axis = null; };
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaX && !event.deltaY) return;
      event.preventDefault();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) horizontal.scrollLeft += event.deltaX;
      else vertical.scrollTop += event.deltaY;
    };

    horizontal.addEventListener('touchstart', onStart, { passive: true });
    horizontal.addEventListener('touchmove', onMove, { passive: false });
    horizontal.addEventListener('touchend', onEnd, { passive: true });
    horizontal.addEventListener('touchcancel', onEnd, { passive: true });
    horizontal.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      horizontal.style.touchAction = previousTouchAction;
      horizontal.removeEventListener('touchstart', onStart);
      horizontal.removeEventListener('touchmove', onMove);
      horizontal.removeEventListener('touchend', onEnd);
      horizontal.removeEventListener('touchcancel', onEnd);
      horizontal.removeEventListener('wheel', onWheel);
    };
  }, []);

  return ref;
};
