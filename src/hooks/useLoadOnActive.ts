import { useEffect } from 'react';

// The "load this tab's data when it becomes the active tab" effect was
// hand-written identically at 9 call sites across RiderHome.tsx and
// AdminHome.tsx — same shape every time: if this condition just became
// true, call the loader. Extracted once so new tabs don't add a 10th copy.
export function useLoadOnActive(isActive: boolean, load: () => void) {
  useEffect(() => {
    if (isActive) load();
  }, [isActive, load]);
}
