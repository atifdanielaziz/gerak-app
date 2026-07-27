import type { ElementType } from 'react';
import { List, PencilLine, Map, PlaneTakeoff } from 'lucide-react';

// Shared between Receipt.tsx, Activity.tsx and DriverHome.tsx so the same
// booking-method (Transport's 4 modes) always gets the same icon+colour
// wherever it's shown. AerBus gets its own green treatment — it's the odd
// one out (time-critical, automatic dispatch buffer) — everything else
// stays the neutral slate used for badges elsewhere in the app.
export const BOOKING_METHOD_ICON: Record<string, ElementType> = {
  quick: List, custom: PencilLine, map: Map, aerbus: PlaneTakeoff,
};

export function bookingMethodBadgeClass(mode?: string): string {
  return mode === 'aerbus'
    ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
    : 'bg-slate-50 border-slate-100 text-slate-500';
}
