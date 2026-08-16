import { useCallback, useEffect, useState } from 'react';

// Table Standard scroll engine. The card itself never moves: the root is
// the horizontal scroller and the optional data-axis-y child is vertical.
// We manually apply each touch/wheel gesture to one dominant axis. Merely
// resetting the cross-axis after native scrolling is not enough on iOS:
// WebKit can keep an unwanted diagonal momentum animation alive after the
// finger lifts, producing the "wide drift" this hook exists to prevent.
// Important: CSS computes the unmentioned overflow axis as `auto` when the
// other axis is scrollable. The standard therefore enforces overflow-y:
// hidden on the horizontal root and overflow-x:hidden on the vertical child;
// without both, "split" containers can still drift diagonally on iOS.
export const useAxisLockedScroll = <T extends HTMLElement>() => {
  // A callback ref is required here. Most admin tables are absent during
  // their initial loading render, so an effect tied to a permanent RefObject
  // ran once with `current === null` and never installed the handlers after
  // the table appeared. Tracking the mounted node reruns setup at the right
  // time and also cleans up when filters temporarily remove the table.
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((element: T | null) => setNode(element), []);

  useEffect(() => {
    const horizontal = node;
    if (!horizontal) return;
    const vertical = horizontal.querySelector<HTMLElement>('[data-axis-y]') ?? horizontal;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let axis: 'x' | 'y' | null = null;
    let ignoreGesture = false;
    const previousTouchAction = horizontal.style.touchAction;
    const previousHorizontalOverflowY = horizontal.style.overflowY;
    const previousVerticalOverflowX = vertical.style.overflowX;
    const previousVerticalWidth = vertical.style.width;
    const previousVerticalMinWidth = vertical.style.minWidth;
    horizontal.style.touchAction = 'none';
    if (vertical !== horizontal) {
      horizontal.style.overflowY = 'hidden';
      vertical.style.overflowX = 'hidden';
      // The vertical wrapper used to collapse to the card width and clip its
      // wide table. That left the outer horizontal scroller with no overflow
      // to move, even when the table itself had a large min-width. Size this
      // wrapper from its table content while retaining a full-width minimum.
      vertical.style.width = 'max-content';
      vertical.style.minWidth = '100%';
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const target = event.target instanceof Element ? event.target : null;
      // Buttons, links and form controls belong to the component using them,
      // not to the table's drag engine. Capturing these touches here can
      // cancel their click on iOS (most visibly the staff action menu).
      ignoreGesture = !!target?.closest('[data-axis-lock-ignore], button, a, input, select, textarea, [role="button"]');
      if (ignoreGesture) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = horizontal.scrollLeft;
      startTop = vertical.scrollTop;
      axis = null;
    };
    const onMove = (event: TouchEvent) => {
      if (ignoreGesture) return;
      const touch = event.touches[0];
      if (!touch) return;
      const moveX = touch.clientX - startX;
      const moveY = touch.clientY - startY;
      const dx = Math.abs(moveX);
      const dy = Math.abs(moveY);
      // Bias toward vertical because ordinary list scrolling naturally has
      // a small sideways component. Horizontal requires deliberate intent.
      if (!axis && Math.max(dx, dy) >= 6) axis = dx > dy * 1.35 ? 'x' : 'y';
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
    const onEnd = () => { axis = null; ignoreGesture = false; };
    const onWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-axis-lock-ignore], input, select, textarea')) return;
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
      if (vertical !== horizontal) {
        horizontal.style.overflowY = previousHorizontalOverflowY;
        vertical.style.overflowX = previousVerticalOverflowX;
        vertical.style.width = previousVerticalWidth;
        vertical.style.minWidth = previousVerticalMinWidth;
      }
      horizontal.removeEventListener('touchstart', onStart);
      horizontal.removeEventListener('touchmove', onMove);
      horizontal.removeEventListener('touchend', onEnd);
      horizontal.removeEventListener('touchcancel', onEnd);
      horizontal.removeEventListener('wheel', onWheel);
    };
  }, [node]);

  return ref;
};
