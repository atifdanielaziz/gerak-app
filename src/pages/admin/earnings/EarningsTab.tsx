import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ChevronLeft, ChevronRight, TrendingUp, Car, GraduationCap } from 'lucide-react';
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

// Jubah's own shape — a flat RM commission per completed order, no
// "TBC"/night-charge concept the way Gerak Car has, so this stays its own
// type/leaderboard/drill-down rather than being forced into
// DriverEarningsRow/computeEarnings.
interface JubahRiderEarningsRow {
  rider_id: string;
  name: string;
  gerak_id: string;
  campus: string;
  total_earnings: number;
  completed_count: number;
}

interface JubahEarningRow {
  reference: string;
  remark: string;
  payment_mode: string;
  is_postage: boolean;
  order_value: number;
  rider_commission_amount: number;
  earned_at: string;
}

type EarningsRole = 'driver' | 'jubah';
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
  const [earningsRole, setEarningsRole]               = useState<EarningsRole>('driver');
  const [earningsLeaderboard, setEarningsLeaderboard] = useState<DriverEarningsRow[]>([]);
  const [earningsLoading, setEarningsLoading]         = useState(false);
  const [earningsDriverId, setEarningsDriverId]       = useState<string | null>(null);
  const [earningsHistory, setEarningsHistory]         = useState<EarningsRow[]>([]);
  // Jubah's own leaderboard/drill-down state — kept separate from the
  // driver ones above rather than reshaping DriverEarningsRow/EarningsRow
  // to fit both, since the two have genuinely different data (flat RM
  // commission vs fare+night_charge+TBC).
  const [jubahLeaderboard, setJubahLeaderboard]       = useState<JubahRiderEarningsRow[]>([]);
  const [jubahRiderId, setJubahRiderId]               = useState<string | null>(null);
  const [jubahHistory, setJubahHistory]               = useState<JubahEarningRow[]>([]);
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

  const loadJubahLeaderboard = useCallback(async (start: string | null, end: string | null) => {
    setEarningsLoading(true);
    const { data } = await supabase.rpc('get_jubah_rider_earnings_leaderboard', { p_start_date: start, p_end_date: end });
    setJubahLeaderboard((data as JubahRiderEarningsRow[]) ?? []);
    setEarningsLoading(false);
  }, []);

  const loadJubahRiderEarnings = useCallback(async (riderId: string) => {
    setEarningsLoading(true);
    const { data } = await supabase.rpc('get_jubah_rider_earnings_history', { p_rider_id: riderId });
    setJubahHistory((data as JubahEarningRow[]) ?? []);
    setEarningsLoading(false);
  }, []);

  useEffect(() => {
    if (!active || earningsDriverId || jubahRiderId) return;
    const [start, end] = getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth);
    if (earningsRole === 'driver') loadEarningsLeaderboard(start, end);
    else loadJubahLeaderboard(start, end);
  }, [active, earningsRole, earningsDriverId, jubahRiderId, earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth, loadEarningsLeaderboard, loadJubahLeaderboard]);

  useImperativeHandle(ref, () => ({
    reload: () => {
      if (earningsDriverId) loadDriverEarnings(earningsDriverId);
      else if (jubahRiderId) loadJubahRiderEarnings(jubahRiderId);
      else if (earningsRole === 'driver') loadEarningsLeaderboard(...getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth));
      else loadJubahLeaderboard(...getLeaderboardRange(earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth));
    },
  }), [earningsDriverId, jubahRiderId, earningsRole, earningsPeriod, earningsDay, earningsWeekStart, leaderboardMonth, loadDriverEarnings, loadJubahRiderEarnings, loadEarningsLeaderboard, loadJubahLeaderboard]);

  const handleSelectEarningsDriver = (driverId: string) => {
    setEarningsDriverId(driverId);
    loadDriverEarnings(driverId);
  };

  const handleSelectJubahRider = (riderId: string) => {
    setJubahRiderId(riderId);
    loadJubahRiderEarnings(riderId);
  };

  const selectedDriver = earningsLeaderboard.find(d => d.driver_id === earningsDriverId);
  const selectedJubahRider = jubahLeaderboard.find(r => r.rider_id === jubahRiderId);
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

  if (jubahRiderId) {
    // Same "Total Earned + Order Breakdown" shape RiderHome.tsx's own
    // Earnings tab shows a rider for themselves — admin just gets to pick
    // which rider.
    const jubahTotal = jubahHistory.reduce((sum, e) => sum + Number(e.rider_commission_amount), 0);
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => { setJubahRiderId(null); setJubahHistory([]); }}
          className="flex items-center gap-1 text-slate-500 text-xs font-semibold hover:underline active:scale-95 transition self-start"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to leaderboard
        </button>

        <div className="bg-white border border-slate-100 rounded-3xl p-5">
          <p className="text-sm font-black text-slate-800">{selectedJubahRider?.name ?? 'Rider'}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            {selectedJubahRider?.gerak_id} · UMPSA {selectedJubahRider?.campus}
          </p>
        </div>

        {earningsLoading ? (
          <div className="flex items-center justify-center py-14">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : jubahHistory.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No completed Jubah orders yet.</p>
        ) : (
          <>
            <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5 flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">Total Earned</span>
              <span className="text-2xl font-black text-emerald-700">RM{jubahTotal.toFixed(2)}</span>
              <span className="text-xs font-semibold text-emerald-600 mt-0.5">{jubahHistory.length} completed {jubahHistory.length === 1 ? 'order' : 'orders'}</span>
            </div>

            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-slate-700">Order Breakdown</h3>
              <div className="flex flex-col divide-y divide-slate-100">
                {jubahHistory.map(e => (
                  <div key={e.reference} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-mono font-bold text-primary truncate">{e.reference}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                          e.is_postage ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}>
                          {e.is_postage ? 'POSTAGE' : 'PICKUP'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-semibold mt-0.5">
                        {e.remark} · RM{Number(e.order_value).toFixed(2)} order
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-emerald-600">+RM{Number(e.rider_commission_amount).toFixed(2)}</p>
                      <p className="text-xs text-slate-400 font-semibold">{new Date(e.earned_at).toLocaleDateString('en-MY')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const driverCount = earningsLeaderboard.length;
  const totalEarnings = earningsLeaderboard.reduce((s, d) => s + d.total_earnings, 0);
  const jubahRiderCount = jubahLeaderboard.length;
  const jubahTotalEarnings = jubahLeaderboard.reduce((s, r) => s + r.total_earnings, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Role toggle — Driver (Gerak Car/Rental) vs Rider (Jubah). Genuinely
          separate data sources/shapes, not just a filter on one query. */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
        {([
          { id: 'driver' as const, label: 'Driver', icon: Car },
          { id: 'jubah' as const, label: 'Rider (Jubah)', icon: GraduationCap },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onPointerDown={e => { e.preventDefault(); setEarningsRole(id); }}
            className="relative flex-1 rounded-xl transition-transform">
            <span className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-400">
              <Icon className="w-3.5 h-3.5" />{label}
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                earningsRole === id ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </span>
          </button>
        ))}
      </div>

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
          <p className="text-lg font-black text-slate-700">{earningsRole === 'driver' ? driverCount : jubahRiderCount}</p>
          <p className="text-xs font-normal text-slate-400">{earningsRole === 'driver' ? 'Drivers Earning' : 'Riders Earning'}</p>
        </div>
        <div className="flex-1 bg-emerald-50 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-black text-emerald-600">RM {(earningsRole === 'driver' ? totalEarnings : jubahTotalEarnings).toFixed(2)}</p>
          <p className="text-xs font-normal text-slate-400">Total Earnings</p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> {earningsRole === 'driver' ? 'Driver' : 'Rider'} Leaderboard
        </h3>

        {earningsLoading ? (
          <div className="flex items-center justify-center py-14">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-500 animate-spin" />
          </div>
        ) : earningsRole === 'driver' ? (
          driverCount === 0 ? (
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
          )
        ) : jubahRiderCount === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No completed Jubah orders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {jubahLeaderboard.map((r, i) => (
              <button
                key={r.rider_id}
                onPointerDown={e => { e.preventDefault(); handleSelectJubahRider(r.rider_id); }}
                className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-2xl px-3.5 py-3 transition active:scale-[0.99] text-left"
              >
                <span className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-black text-slate-500 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400 font-semibold">{r.gerak_id} · UMPSA {r.campus}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-emerald-600">RM {r.total_earnings.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-semibold">{r.completed_count} orders</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
