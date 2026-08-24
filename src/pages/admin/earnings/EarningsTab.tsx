import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { MonthDrumPicker, EarningsCard, computeEarnings, type EarningsRow } from '../../../components/EarningsCard';

interface DriverEarningsRow {
  driver_id: string;
  name: string;
  gerak_id: string;
  campus: string;
  total_earnings: number;
  completed_count: number;
  cash_count: number;
  tbc_count: number;
}

type EarningsPeriod = 'day' | 'week' | 'month' | 'all';

const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISODate(d); };
const mondayOf = (iso: string) => { const d = new Date(iso + 'T00:00:00'); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISODate(d); };

function getLeaderboardRange(period: EarningsPeriod, day: string, weekStart: string, month: string): [string | null, string | null] {
  if (period === 'day') return [day, day];
  if (period === 'week') return [weekStart, addDays(weekStart, 6)];
  if (period === 'month') {
    const [y, m] = month.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = toISODate(new Date(y, m, 0));
    return [start, end];
  }
  return [null, null];
}

export interface EarningsTabHandle {
  reload: () => void;
}

interface EarningsTabProps {
  active: boolean;
}

// Superadmin driver-earnings leaderboard + per-driver drill-down — split out
// of AdminHome.tsx. Fully self-contained: no shared modal state, no data
// reused by other tabs.
export const EarningsTab = forwardRef<EarningsTabHandle, EarningsTabProps>(function EarningsTab(
  { active },
  ref
) {
  const [earningsLeaderboard, setEarningsLeaderboard] = useState<DriverEarningsRow[]>([]);
  const [earningsLoading, setEarningsLoading]         = useState(false);
  const [earningsDriverId, setEarningsDriverId]       = useState<string | null>(null);
  const [earningsHistory, setEarningsHistory]         = useState<EarningsRow[]>([]);
  const [earningsPeriod, setEarningsPeriod]           = useState<EarningsPeriod>('all');
  const [earningsDay, setEarningsDay]                 = useState(() => toISODate(new Date()));
  const [earningsWeekStart, setEarningsWeekStart]     = useState(() => mondayOf(toISODate(new Date())));
  const [leaderboardMonth, setLeaderboardMonth]       = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [detailMonth, setDetailMonth]                 = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadEarningsLeaderboard = useCallback(async (start: string | null, end: string | null) => {
    setEarningsLoading(true);
    const { data } = await supabase.rpc('get_driver_earnings_leaderboard', { p_start_date: start, p_end_date: end });
    setEarningsLeaderboard((data as DriverEarningsRow[]) ?? []);
    setEarningsLoading(false);
  }, []);

  const loadDriverEarnings = useCallback(async (driverId: string) => {
    setEarningsLoading(true);
    const { data } = await supabase.rpc('get_driver_earnings_history', { p_driver_id: driverId });
    setEarningsHistory((data as EarningsRow[]) ?? []);
    setEarningsLoading(false);
  }, []);

  useEffect(() => {
    if (!active || earningsDriverId) return;
    const [start, end] = getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth);
    loadEarningsLeaderboard(start, end);
  }, [active, earningsDriverId, earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth, loadEarningsLeaderboard]);

  useImperativeHandle(ref, () => ({
    reload: () => {
      if (earningsDriverId) loadDriverEarnings(earningsDriverId);
      else loadEarningsLeaderboard(...getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth));
    },
  }), [earningsDriverId, earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth, loadDriverEarnings, loadEarningsLeaderboard]);

  const handleSelectEarningsDriver = (driverId: string) => {
    setEarningsDriverId(driverId);
    loadDriverEarnings(driverId);
  };

  const selectedDriver = earningsLeaderboard.find(d => d.driver_id === earningsDriverId);
  const weekEnd = addDays(earningsWeekStart, 6);
  const weekLabel = `${new Date(earningsWeekStart + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  if (earningsDriverId) {
    // True mirror of DriverHome.tsx's own Earnings tab — current month
    // (browsable) + all-time — independent of whatever period filter is
    // active on the leaderboard.
    const [selY, selM] = detailMonth.split('-');
    const detailMonthLabel = new Date(Number(selY), Number(selM) - 1, 1)
      .toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
    const month = computeEarnings(earningsHistory, detailMonth);
    const allTime = computeEarnings(earningsHistory);

    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => { setEarningsDriverId(null); setEarningsHistory([]); }}
          className="flex items-center gap-1 text-slate-500 text-xs font-semibold hover:underline active:scale-95 transition self-start"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to leaderboard
        </button>

        <div className="bg-white border border-slate-100 rounded-3xl p-5">
          <p className="text-sm font-black text-slate-800">{selectedDriver?.name ?? 'Driver'}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            {selectedDriver?.gerak_id} · UMPSA {selectedDriver?.campus}
          </p>
        </div>

        {earningsLoading ? (
          <div className="flex items-center justify-center py-14">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-0">
            <MonthDrumPicker value={detailMonth} onChange={setDetailMonth} />
            <EarningsCard label={detailMonthLabel} earned={month.earned} tbc={month.tbc} rows={month.rows} />
            <EarningsCard label="All Time" earned={allTime.earned} tbc={allTime.tbc} rows={allTime.rows} />
          </div>
        )}
      </div>
    );
  }

  const driverCount = earningsLeaderboard.length;
  const totalEarnings = earningsLeaderboard.reduce((s, d) => s + d.total_earnings, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Period toggle */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
        {(['day', 'week', 'month', 'all'] as const).map(p => {
          const label = p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All Time';
          // Two stacked layers instead of toggling bg-primary directly —
          // this WebView unreliably repaints colour changes; opacity
          // changes repaint reliably, so only opacity is toggled here.
          return (
            <button key={p} onPointerDown={e => { e.preventDefault(); setEarningsPeriod(p); }}
              className="relative flex-1 rounded-xl transition-transform">
              <span className="block py-2 text-xs font-semibold text-slate-400">{label}</span>
              <span
                className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                  earningsPeriod === p ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Period-specific picker */}
      {earningsPeriod === 'day' && (
        <input
          type="date"
          value={earningsDay}
          onChange={e => setEarningsDay(e.target.value)}
          className="bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
        />
      )}
      {earningsPeriod === 'week' && (
        <div className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-3 py-3">
          <button onClick={() => setEarningsWeekStart(addDays(earningsWeekStart, -7))}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-primary transition active:scale-90">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-xs font-black text-slate-700">{weekLabel}</p>
          <button onClick={() => setEarningsWeekStart(addDays(earningsWeekStart, 7))}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-primary transition active:scale-90">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {earningsPeriod === 'month' && (
        <MonthDrumPicker value={leaderboardMonth} onChange={setLeaderboardMonth} />
      )}

      {/* Summary */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex gap-3">
        <div className="flex-1 bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-black text-slate-700">{driverCount}</p>
          <p className="text-xs font-normal text-slate-400">Drivers Earning</p>
        </div>
        <div className="flex-1 bg-emerald-50 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-black text-emerald-600">RM {totalEarnings.toFixed(2)}</p>
          <p className="text-xs font-normal text-slate-400">Total Earnings</p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> Driver Leaderboard
        </h3>

        {earningsLoading ? (
          <div className="flex items-center justify-center py-14">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : driverCount === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No completed rides yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {earningsLeaderboard.map((d, i) => (
              <button
                key={d.driver_id}
                onPointerDown={e => { e.preventDefault(); handleSelectEarningsDriver(d.driver_id); }}
                className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl px-3.5 py-3 transition active:scale-[0.99] text-left"
              >
                <span className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-black text-slate-500 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{d.name}</p>
                  <p className="text-xs text-slate-400 font-semibold">{d.gerak_id} · UMPSA {d.campus}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-emerald-600">RM {d.total_earnings.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-semibold">{d.completed_count} rides</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
