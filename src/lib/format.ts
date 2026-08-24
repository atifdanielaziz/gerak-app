// Shared formatters — previously duplicated verbatim across
// DriverHome.tsx, GerakRental.tsx and AcademicCalendar.tsx.

export const toDateStr = (d: Date) => d.toISOString().split('T')[0];
export const todayStr  = () => toDateStr(new Date());

// 24h (half-hour granularity, e.g. 13.5) -> "1:30 PM"
export const fmt12 = (h: number) => {
  const total = ((h % 24) + 24) % 24;
  const hh  = Math.floor(total);
  const mm  = total % 1 !== 0 ? ':30' : ':00';
  const p   = hh < 12 ? 'AM' : 'PM';
  const dh  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${dh}${mm} ${p}`;
};

// Hour count -> "30 min" / "2h" / "2h 30m"
export const fmtDuration = (h: number | string) => {
  const n = Number(h);
  return n < 1 ? '30 min' : Number.isInteger(n) ? `${n}h` : `${Math.floor(n)}h 30m`;
};

// "0123456789" -> "012-3456789" as the user types. Bookings store the
// number in this exact dashed form, so anywhere it's re-entered for an
// exact-match lookup (e.g. Jubah tracking-by-phone) needs the same
// formatting, not just cosmetic consistency — a mismatched format means a
// correct number still fails to find the booking.
export const formatPhone = (val: string) => {
  const d = val.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
};

// "010203040506" -> "010203-04-0506" as the user types. Was duplicated
// identically in Jubah.tsx and Profile.tsx — a live-input formatter for
// progressive typing, distinct from receiptRows.ts's own formatIc (a
// display-only formatter for an already-complete value that may arrive
// masked with 'X' characters from the server — that one deliberately
// stays separate, since re-stripping a masked value here would mangle it).
// Seconds -> "M:SS". Was duplicated identically in MyOrders.tsx and
// DriverHome.tsx — just the formatter; each file's own grace-period
// constant (how many seconds the countdown starts from) stays where it
// is, since customer vs. driver cancel windows may be deliberately
// different business rules, not something to merge without confirming.
export const fmtCountdown = (secs: number) =>
  `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

export const formatIcNumber = (val: string) => {
  const d = val.replace(/\D/g, '').slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
};
