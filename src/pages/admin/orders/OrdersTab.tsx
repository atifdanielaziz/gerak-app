import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  BarChart3, Car, Users, MapPin, Navigation, Clock, Trash2,
  Search, RefreshCw, X, TrendingUp, Phone,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { NativeSelect } from '../../../components/NativeSelect';
import { BOOKING_METHOD_LABEL } from '../../../lib/receiptRows';

interface RideOrder {
  id: string;
  customer_name: string;
  campus: string;
  date: string;
  time: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: string;
  night_charge: number;
  notes: string;
  status: string;
  cancel_reason: string | null;
  book_mode: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  created_at: string;
  accepted_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  accepted:    'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled:   'bg-red-50 text-red-500 border-red-200',
};

type FilterStatus = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
type SortKey = 'created_at' | 'passengers' | 'fare' | 'accept';

export interface OrdersTabHandle {
  reload: () => void;
}

interface OrdersTabProps {
  active: boolean;
  // Regular admin is view-only for confirming Jubah payments — only the
  // assigned rider or superadmin can actually approve (server-enforced in
  // update_jubah_booking_status/mark_jubah_balance_paid, see migration_
  isSuperAdmin: boolean;
  // campusView is shared with the Routes tab's own campus switcher — read
  // and written here, not owned here.
  campusView: 'Pekan' | 'Gambang';
  onCampusViewChange: (c: 'Pekan' | 'Gambang') => void;
  showToast: (msg: string) => void;
}

const fareValue = (o: RideOrder): number | null =>
  o.fare === 'TBC' ? null : Number(o.fare) + o.night_charge;

// Minutes from created_at to accepted_at, or to "now" while still pending —
// same rule the 30-minute auto-expiry itself uses server-side. A cancelled
// order with no accepted_at has no known duration UNLESS the system's own
// timeout cancelled it (that duration is exactly 30 by definition).
const acceptMinutes = (o: RideOrder, now: number): number | null => {
  if (o.status === 'pending') return (now - new Date(o.created_at).getTime()) / 60000;
  if (o.accepted_at) return (new Date(o.accepted_at).getTime() - new Date(o.created_at).getTime()) / 60000;
  if (o.cancel_reason?.includes('30 minutes')) return 30;
  return null;
};

// The "Created" column and its sort both key off created_at, not the
// customer's chosen pickup date/time (order.date/order.time) — those can
// differ for "Later" bookings, so this must not reuse those fields.
const fmtCreated = (iso: string) => {
  const d = new Date(iso);
  return { date: d.toLocaleDateString('en-CA'), time: d.toLocaleTimeString('en-GB') };
};

// A cancelled order can still carry a quoted fare, but it never happened —
// showing that figure next to "CANCELLED" reads as counted revenue even
// though it's already excluded from the Revenue/Earnings math.
const fmtPrice = (o: RideOrder) => {
  if (o.status === 'cancelled') return <span className="text-slate-300">—</span>;
  if (o.fare === 'TBC') return <span className="text-slate-300 font-semibold">TBC</span>;
  return `RM${(Number(o.fare) + o.night_charge).toFixed(0)}`;
};

const fmtAccept = (mins: number | null) => {
  if (mins === null) return <span className="text-slate-300">—</span>;
  const cls = mins > 30 ? 'text-red-500 font-bold' : mins >= 10 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold';
  const text = mins < 1 ? `${Math.round(mins * 60)}s` : `${mins.toFixed(1)}m`;
  return <span className={cls}>{text}</span>;
};

// Ride-hailing order list — split out of AdminHome.tsx. Unlike every other
// tab here, this one keeps a live Postgres realtime subscription (new/
// updated orders push in without a manual refresh) rather than a plain
// load-on-active fetch. That subscription previously ran for the whole
// AdminHome lifetime regardless of which tab was on screen; now it runs for
// as long as this component is mounted, i.e. while the Orders tab is
// active — same end result (always fresh whenever you're looking at
// Orders), just scoped to when it's actually rendered instead of running
// invisibly in the background on every other tab too.
export const OrdersTab = forwardRef<OrdersTabHandle, OrdersTabProps>(function OrdersTab(
  { isSuperAdmin, campusView, onCampusViewChange, showToast },
  ref
) {
  const { showConfirmModal } = useApp();
  const [orders, setOrders] = useState<RideOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [bookModeFilter, setBookModeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [showEarnings, setShowEarnings] = useState(false);

  // silent=true skips the loading-spinner toggle — used for realtime-driven
  // reloads so an unrelated order elsewhere in this campus doesn't flash the
  // whole list to a loading state out from under whoever's looking at it.
  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const { data } = await supabase
      .from('ride_orders')
      .select('id,customer_name,campus,date,time,pickup,destination,passengers,contact,fare,night_charge,notes,status,cancel_reason,book_mode,driver_id,driver_name,driver_contact,created_at,accepted_at')
      .eq('campus', campusView)
      .order('created_at', { ascending: false });

    setOrders((data as RideOrder[]) ?? []);
    if (!opts?.silent) setLoading(false);
  }, [campusView]);

  useEffect(() => {
    loadOrders();
    // Server-side filter (not just the .eq('campus', ...) on the read
    // above) — without it, this subscription fired a full reload for every
    // order change on EVERY campus, not just the one currently on screen.
    const channel = supabase
      .channel('ride_orders_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_orders', filter: `campus=eq.${campusView}` }, () => loadOrders({ silent: true }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadOrders, campusView]);

  useImperativeHandle(ref, () => ({ reload: loadOrders }), [loadOrders]);

  const handleDelete = async (orderId: string) => {
    setDeleting(orderId);
    const { error } = await supabase.from('ride_orders').delete().eq('id', orderId);
    setDeleting(null);
    if (error) showToast('Delete failed: ' + error.message);
    else { showToast('Order removed.'); loadOrders(); }
  };

  const handleForceStatus = async (orderId: string, status: string) => {
    await supabase.rpc('update_ride_status', { p_order_id: orderId, p_status: status });
    loadOrders();
  };

  const now = Date.now();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = orders.filter(o => {
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchMode = bookModeFilter === 'all' || o.book_mode === bookModeFilter;
      const matchSearch = !q || o.customer_name.toLowerCase().includes(q) || o.contact.includes(q);
      return matchStatus && matchMode && matchSearch;
    });
    if (sortKey) {
      const get = (o: RideOrder): number => {
        if (sortKey === 'created_at') return new Date(o.created_at).getTime();
        if (sortKey === 'passengers') return o.passengers;
        if (sortKey === 'fare') return fareValue(o) ?? -1;
        return acceptMinutes(o, now) ?? -1;
      };
      list = [...list].sort((a, b) => (get(a) - get(b)) * sortDir);
    }
    return list;
  }, [orders, statusFilter, bookModeFilter, search, sortKey, sortDir, now]);

  const pendingCount   = useMemo(() => orders.filter(o => o.status === 'pending').length, [orders]);
  const completedCount = useMemo(() => orders.filter(o => o.status === 'completed').length, [orders]);
  const cancelledCount = useMemo(() => orders.filter(o => o.status === 'cancelled').length, [orders]);
  const revenue = useMemo(() =>
    orders.filter(o => o.status === 'completed').reduce((s, o) => s + (fareValue(o) ?? 0), 0),
  [orders]);

  // Per-driver earnings — completed orders in the current campus view only,
  // grouped by driver name. Orders with no recorded driver (rare, e.g. very
  // old data from before driver tracking existed) roll up into a null key
  // so the breakdown always reconciles to the same total shown above it,
  // instead of silently only accounting for part of it.
  const driverBreakdown = useMemo(() => {
    const map = new Map<string | null, { rides: number; total: number }>();
    orders.filter(o => o.status === 'completed').forEach(o => {
      const key = o.driver_name;
      const cur = map.get(key) ?? { rides: 0, total: 0 };
      cur.rides += 1;
      cur.total += fareValue(o) ?? 0;
      map.set(key, cur);
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [orders]);
  const maxDriverTotal = Math.max(...driverBreakdown.map(d => d.total), 1);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };
  const sortArrow = (key: SortKey) => (
    <span className={`ml-1 ${sortKey === key ? 'text-primary' : 'text-slate-300'}`}>
      {sortKey === key ? (sortDir === 1 ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-2xl font-black text-slate-800">{pendingCount + completedCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Total orders</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-2xl font-black text-amber-600">{pendingCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Pending</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-2xl font-black text-emerald-600">{completedCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Completed</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <p className="text-2xl font-black text-red-500">{cancelledCount}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Cancelled</p>
        </div>
        {/* Revenue is superadmin-only — the card doesn't exist at all for
            regular admin, not locked/greyed out, just absent. */}
        {isSuperAdmin && (
          <button
            onClick={() => setShowEarnings(true)}
            className="col-span-2 lg:col-span-4 bg-white border border-slate-100 rounded-2xl p-4 text-left transition active:scale-[0.99] hover:border-slate-200"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-black text-slate-800">RM{revenue.toFixed(0)}</p>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Revenue (completed) · tap for driver breakdown</p>
              </div>
              <TrendingUp className="w-5 h-5 text-slate-300 shrink-0" />
            </div>
          </button>
        )}
      </div>

      {/* ── Search + filters ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by customer or phone…"
              style={{ fontSize: '12px' }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal placeholder:text-slate-300"
            />
          </div>
          <button
            onClick={() => loadOrders()}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-primary transition active:scale-90 shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className={`grid gap-2 ${isSuperAdmin ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
          {/* Campus — superadmin only, same gate as the toggle it replaces */}
          {isSuperAdmin && (
            <NativeSelect
              value={campusView}
              onChange={onCampusViewChange}
              options={[{ value: 'Pekan', label: 'Pekan' }, { value: 'Gambang', label: 'Gambang' }]}
            />
          )}
          <NativeSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <NativeSelect
            value={bookModeFilter}
            onChange={setBookModeFilter}
            options={[
              { value: 'all', label: 'All Modes' },
              ...Object.entries(BOOKING_METHOD_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </div>

      {/* ── Orders — desktop table (≥ lg) ── */}
      <div className="hidden lg:block bg-white border border-slate-100 rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">
            {filtered.length} Order{filtered.length !== 1 ? 's' : ''}
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <div className="overflow-y-auto no-scrollbar max-h-[560px]">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="text-xs font-normal text-slate-400 border-b border-slate-100">
                    <th onClick={() => toggleSort('created_at')} className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap cursor-pointer select-none hover:text-slate-600">
                      Created{sortArrow('created_at')}
                    </th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Customer</th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Phone</th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Route</th>
                    <th onClick={() => toggleSort('passengers')} className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap cursor-pointer select-none hover:text-slate-600">
                      Pax{sortArrow('passengers')}
                    </th>
                    <th onClick={() => toggleSort('fare')} className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap cursor-pointer select-none hover:text-slate-600">
                      Price{sortArrow('fare')}
                    </th>
                    <th onClick={() => toggleSort('accept')} className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap cursor-pointer select-none hover:text-slate-600">
                      Time to Accept{sortArrow('accept')}
                    </th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Driver</th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Status</th>
                    <th className="sticky top-0 bg-white py-2 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(order => (
                    <tr key={order.id} className="border-b border-slate-50 text-xs hover:bg-slate-50 transition">
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-700">{fmtCreated(order.created_at).date}</span>
                        <br /><span className="text-slate-400">{fmtCreated(order.created_at).time}</span>
                      </td>
                      <td className="py-2.5 pr-4 font-semibold text-slate-800 whitespace-nowrap">{order.customer_name}</td>
                      <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{order.contact}</td>
                      <td className="py-2.5 pr-4 text-slate-500 max-w-[260px]">
                        <span className="truncate block" title={`${order.pickup} → ${order.destination}`}>
                          {order.pickup} <span className="text-slate-300">→</span> {order.destination}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{order.passengers} pax</td>
                      <td className="py-2.5 pr-4 font-bold text-slate-800 whitespace-nowrap">
                        {fmtPrice(order)}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{fmtAccept(acceptMinutes(order, now))}</td>
                      <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{order.driver_name ?? <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase ${STATUS_COLORS[order.status]}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                        {order.status === 'cancelled' && order.cancel_reason && (
                          <span className="block text-[10px] text-amber-600 font-semibold mt-0.5 max-w-[160px]">{order.cancel_reason}</span>
                        )}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {order.status === 'pending' && (
                            <button
                              onClick={() => handleForceStatus(order.id, 'cancelled')}
                              title="Cancel order"
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 border border-red-100 text-red-500 active:scale-95 transition"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => showConfirmModal({
                              title: 'Delete Order?',
                              message: 'This permanently removes this order. This can\'t be undone.',
                              confirmLabel: 'DELETE',
                              onConfirm: () => handleDelete(order.id),
                            })}
                            disabled={deleting === order.id}
                            title="Delete order"
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-red-500 active:scale-95 transition disabled:opacity-50"
                          >
                            {deleting === order.id
                              ? <span className="w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Orders — mobile cards (< lg) ── */}
      <div className="lg:hidden bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">
            {filtered.length} Order{filtered.length !== 1 ? 's' : ''}
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">No orders yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto no-scrollbar max-h-[520px] flex flex-col gap-4">
            {filtered.map(order => (
              <div key={order.id} className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-black text-slate-800 truncate">{order.customer_name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase shrink-0 ${STATUS_COLORS[order.status]}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtCreated(order.created_at).date} · {fmtCreated(order.created_at).time}</p>
                  </div>
                  <span className="text-sm font-black text-slate-800 shrink-0">
                    {fmtPrice(order)}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl px-3 py-2 flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                    <span className="font-semibold truncate">{order.pickup}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Navigation className="w-3 h-3 text-red-500 shrink-0" />
                    <span className="font-semibold truncate">{order.destination}</span>
                  </div>
                </div>

                <div className="flex items-center flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {order.passengers} pax
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {order.contact}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtAccept(acceptMinutes(order, now))}
                  </span>
                  {order.night_charge > 0 && (
                    <span className="text-amber-500 font-semibold">Night +RM{order.night_charge}</span>
                  )}
                  {order.driver_name && (
                    <span className="flex items-center gap-1 text-blue-500 font-semibold">
                      <Car className="w-3 h-3" /> {order.driver_name}
                    </span>
                  )}
                </div>

                {order.notes && (
                  <p className="text-xs text-slate-400 italic">"{order.notes}"</p>
                )}

                {order.status === 'cancelled' && order.cancel_reason && (
                  <p className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    {order.cancel_reason}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => handleForceStatus(order.id, 'cancelled')}
                      className="flex-1 bg-red-50 border border-red-100 text-red-500 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  <button
                    onClick={() => showConfirmModal({
                      title: 'Delete Order?',
                      message: 'This permanently removes this order. This can\'t be undone.',
                      confirmLabel: 'DELETE',
                      onConfirm: () => handleDelete(order.id),
                    })}
                    disabled={deleting === order.id}
                    className="px-3 bg-slate-50 border border-slate-200 text-slate-400 hover:text-red-500 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {deleting === order.id
                      ? <span className="w-3 h-3 rounded-full border border-slate-400 border-t-transparent animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Driver earnings modal (superadmin only) ── */}
      {showEarnings && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onPointerDown={(e) => { e.preventDefault(); setShowEarnings(false); }}>
          <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
            onPointerDown={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-800">Driver Earnings</h3>
              <button onClick={() => setShowEarnings(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-4 text-center mb-4">
              <p className="text-2xl font-black text-emerald-700">RM{revenue.toFixed(0)}</p>
              <p className="text-xs text-emerald-600 font-semibold mt-0.5">Total revenue, completed orders</p>
              <p className="text-[10px] text-slate-400 mt-1">{campusView} · superadmin only</p>
            </div>
            <div className="flex flex-col gap-2">
              {driverBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 font-semibold text-center py-4">No completed orders yet.</p>
              ) : driverBreakdown.map((d, i) => (
                <div key={d.name ?? '__unassigned__'} className={`flex items-center gap-3 p-2.5 rounded-xl ${i === 0 ? 'bg-slate-50' : ''}`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                    i === 0 ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${d.name ? 'text-slate-800' : 'text-slate-400 italic font-semibold'}`}>
                      {d.name ?? 'Unassigned (no driver recorded)'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold">{d.rides} completed {d.rides === 1 ? 'ride' : 'rides'}</p>
                    <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(d.total / maxDriverTotal * 100).toFixed(0)}%` }} />
                    </div>
                  </div>
                  <p className="text-sm font-black text-slate-800 shrink-0">RM{d.total.toFixed(0)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
