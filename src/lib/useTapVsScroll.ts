import { useRef } from 'react';

// Rows inside a scrollable list can't use onPointerDown+preventDefault for
// taps (the app's usual instant-feedback convention) — preventDefault on
// pointerdown also cancels the browser's native touch-scroll gesture, so a
// finger landing on any row blocks the whole list from scrolling. This
// tracks the pointerdown start position and only fires the tap callback on
// pointerup if the finger didn't move far enough to have been a scroll —
// no preventDefault, so native scrolling is never blocked.
const MOVE_THRESHOLD = 10;

export function useTapVsScroll() {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: React.PointerEvent, onTap: () => void) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) < MOVE_THRESHOLD && Math.abs(e.clientY - s.y) < MOVE_THRESHOLD) {
      onTap();
    }
  };

  return { onPointerDown, onPointerUp };
}
