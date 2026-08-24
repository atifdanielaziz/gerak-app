import React, { useEffect, useRef } from 'react';
import { TrendingUp } from 'lucide-react';

const ITEM_H = 40;
const DRUM_H = 120;

export interface EarningsRow {
  date: string;
  fare: string;
  night_charge: number;
  status: string;
}

// completed rows in, optionally narrowed to one 'YYYY-MM' month — 'TBC' fares
// (rides not yet priced) are excluded from the sum and counted separately.
export function computeEarnings(completed: EarningsRow[], monthFilter?: string) {
  const rows = monthFilter ? completed.filter(o => o.date.startsWith(monthFilter)) : completed;
  const earned = rows.filter(o => o.fare !== 'TBC').reduce((s, o) => s + Number(o.fare) + (o.night_charge ?? 0), 0);
  const tbc = rows.filter(o => o.fare === 'TBC').length;
  return { earned, tbc, rows };
}

export const MonthDrumPicker: React.FC<{ value: string; onChange: (m: string) => void }> = ({ value, onChange }) => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const ref = useRef<HTMLDivElement>(null);
  const padding = (DRUM_H - ITEM_H) / 2;

  useEffect(() => {
    const idx = months.indexOf(value);
    if (ref.current && idx >= 0) {
      ref.current.scrollTop = idx * ITEM_H;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    if (!ref.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(idx, months.length - 1));
    if (months[clamped] !== value) onChange(months[clamped]);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-100" style={{ height: DRUM_H }}>
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll no-scrollbar"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        <div style={{ height: padding }} />
        {months.map(m => {
          const [y, mo] = m.split('-');
          const lbl = new Date(Number(y), Number(mo) - 1, 1)
            .toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
          return (
            <div key={m} style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
              className={`flex items-center justify-center transition-all ${
                value === m
                  ? 'text-emerald-600 text-base font-semibold'
                  : 'text-slate-400 text-sm font-semibold'
              }`}>
              {lbl}
            </div>
          );
        })}
        <div style={{ height: padding }} />
      </div>

      {/* Top & bottom fade */}
      <div className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: padding, background: 'linear-gradient(to bottom, white 40%, transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: padding, background: 'linear-gradient(to top, white 40%, transparent)' }} />

      {/* Selection lines */}
      <div className="absolute inset-x-6 pointer-events-none border-t-2 border-b-2 border-emerald-200 rounded"
        style={{ top: padding, height: ITEM_H }} />
    </div>
  );
};

export const EarningsCard: React.FC<{
  label: string; earned: number; tbc: number; rows: EarningsRow[];
}> = ({ label, earned, tbc, rows }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
      {label} Earnings
    </p>
    <div className="flex items-center gap-3 flex-wrap">
      <div>
        <p className="text-xs text-slate-400 font-semibold mb-0.5">Cash Fare</p>
        <p className="text-xs font-black text-slate-800">
          RM <span className="text-emerald-500">{earned.toFixed(2)}</span>
        </p>
      </div>
      {tbc > 0 && (
        <>
          <p className="text-xs font-black text-slate-300">+</p>
          <div>
            <p className="text-xs text-slate-400 font-semibold mb-0.5">TBC Rides</p>
            <p className="text-xs font-black text-slate-800">
              TBC <span className="text-amber-500">({tbc})</span>
            </p>
          </div>
        </>
      )}
    </div>
    <div className="flex gap-3 pt-1">
      <div className="flex-1 bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
        <p className="text-lg font-black text-slate-700">{rows.length}</p>
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Completed</p>
      </div>
      <div className="flex-1 bg-emerald-50 rounded-2xl px-3 py-2.5 text-center">
        <p className="text-lg font-black text-emerald-600">{rows.filter(o => o.fare !== 'TBC').length}</p>
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cash Rides</p>
      </div>
      {tbc > 0 && (
        <div className="flex-1 bg-amber-50 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-black text-amber-600">{tbc}</p>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">TBC Rides</p>
        </div>
      )}
    </div>
  </div>
);
