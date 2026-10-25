import { jubahCollectedByDay, jubahFilterDone, type JubahDoneStatus } from '../lib/jubahStatus';

type Row = { collected_at?: string | null; status: string };

// Collected / Delivered / collected-day chips above the Jubah tables. Every
// chip is a toggle filter; status and day combine, and each group's counts
// follow the other group's selection.
export function JubahDoneChips({ rows, status, onStatus, day, onDay, className = '' }: {
  rows: Row[];
  status: JubahDoneStatus | null;
  onStatus: (s: JubahDoneStatus | null) => void;
  day: string | null;
  onDay: (d: string | null) => void;
  className?: string;
}) {
  const byDay = jubahFilterDone(rows, null, day);
  const byStatus = jubahFilterDone(rows, status, null);
  const chip = 'text-[11px] font-semibold px-2.5 py-1 rounded-full tabular-nums transition whitespace-nowrap';
  const statusChip = (s: JubahDoneStatus, label: string, idle: string, on: string) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); onStatus(status === s ? null : s); }}
      title={status === s ? 'Show all statuses' : `Show only ${label} bookings`}
      className={`${chip} ${status === s ? on : idle}`}>
      {label} {byDay.filter(r => r.status === s).length}{status === s ? ' ✕' : ''}
    </button>
  );
  return (
    <span className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {statusChip('collected', 'Collected', 'bg-emerald-200 text-emerald-900 hover:bg-emerald-300', 'bg-emerald-700 text-white')}
      {statusChip('delivered', 'Delivered', 'bg-blue-200 text-blue-900 hover:bg-blue-300', 'bg-blue-700 text-white')}
      {jubahCollectedByDay(byStatus).map(([d, n]) => (
        <button key={d} type="button" onClick={(e) => { e.stopPropagation(); onDay(day === d ? null : d); }}
          title={day === d ? 'Show all days' : `Show only bookings collected ${d}`}
          className={`${chip} ${day === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          {d}: {n}{day === d ? ' ✕' : ''}
        </button>
      ))}
    </span>
  );
}
