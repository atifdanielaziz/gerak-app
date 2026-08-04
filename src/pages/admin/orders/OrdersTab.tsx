import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { BarChart3, Car, Users, MapPin, Navigation, AlertCircle, Clock, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../../context/AppContext';

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
  driver_id: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  accepted:    'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed:   'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled:   'bg-red-50 text-red-500 border-red-200',
};

type FilterStatus = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface OrdersTabHandle {
  reload: () => void;
}

interface OrdersTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  // campusView is shared with the Routes tab's own campus switcher — read
  // and written here, not owned here.
  campusView: 'Pekan' | 'Gambang';
  onCampusViewChange: (c: 'Pekan' | 'Gambang') => void;
  showToast: (msg: string) => void;
}

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
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // silent=true skips the loading-spinner toggle — used for realtime-driven
  // reloads so an unrelated order elsewhere in this campus doesn't flash the
  // whole list to a loading state out from under whoever's looking at it.
  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const q = supabase
      .from('ride_orders')
      .select('id,customer_name,campus,date,time,pickup,destination,passengers,contact,fare,night_charge,notes,status,cancel_reason,driver_id,driver_name,driver_contact,created_at,accepted_at')
      .eq('campus', campusView)
      .order('created_at', { ascending: false });

    const { data } = await q;
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Campus toggle — superadmin only */}
      {isSuperAdmin && (
        <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
          {(['Gambang', 'Pekan'] as const).map(c => (
            // Two stacked layers instead of toggling bg-primary directly —
            // this WebView unreliably repaints colour changes; opacity
            // changes repaint reliably, so only opacity is toggled here.
            <button
              key={c}
              onPointerDown={(e) => { e.preventDefault(); onCampusViewChange(c); }}
              className="relative flex-1 rounded-xl transition-transform"
            >
              <span className="block py-2 text-xs font-semibold text-slate-400">{c}</span>
              <span
                className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                  campusView === c ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {c}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filter dropdown */}
      <div ref={filterDropdownRef} className="relative">
        <button
          type="button"
          onPointerDown={e => { e.preventDefault(); setShowFilterDropdown(v => !v); }}
          className="w-full flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition-transform active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <span className="text-slate-800 font-semibold uppercase text-xs tracking-wide">
              {filter.replace('_', ' ')}
            </span>
            {filter !== 'all' && orders.filter(o => o.status === filter).length > 0 && (
              <span className="bg-primary/10 text-primary text-xs font-semibold px-1.5 py-0.5 rounded-full">
                {orders.filter(o => o.status === filter).length}
              </span>
            )}
          </span>
          {showFilterDropdown
            ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
        </button>

        {showFilterDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 overflow-hidden">
            <div className="max-h-48 overflow-y-auto no-scrollbar">
              {(['all', 'pending', 'accepted', 'in_progress', 'completed', 'cancelled'] as FilterStatus[]).map((f, i, arr) => (
                <button
                  key={f}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); setFilter(f); setShowFilterDropdown(false); }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-transform ${
                    i < arr.length - 1 ? 'border-b border-slate-100' : ''
                  } ${
                    filter === f
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="uppercase text-xs tracking-wide">{f.replace('_', ' ')}</span>
                  {f !== 'all' && orders.filter(o => o.status === f).length > 0 && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      filter === f ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {orders.filter(o => o.status === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Orders list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
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
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-black text-slate-800 truncate">{order.customer_name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase shrink-0 ${STATUS_COLORS[order.status]}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{order.date} · {order.time}</p>
                  </div>
                  <span className="text-sm font-black text-slate-800 shrink-0">
                    RM{order.fare === 'TBC' ? 'TBC' : (Number(order.fare) + order.night_charge).toFixed(0)}
                  </span>
                </div>

                {/* Route */}
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

                {/* Meta */}
                <div className="flex items-center flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {order.passengers} pax
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {order.contact}
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

                {/* Admin actions */}
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
    </div>
  );
});
