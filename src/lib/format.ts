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
