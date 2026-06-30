import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  ClipboardList, Car, Phone, X, IdCard,
  User, Hash, ShieldCheck, XCircle, RotateCcw,
} from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';
import { OrderReceiptBlock } from '../components/OrderReceiptSheet';

interface RideOrder {
  id: string;
  date: string;
  time: string;
  campus: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: string;
  night_charge: number;
  notes: string;
  book_mode: string;
  status: string;
  driver_name: string | null;
  driver_contact: string | null;
  driver_vehicle: string | null;
  driver_plate: string | null;
  driver_gerak_id: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-600 border-amber-200',
  accepted:    'bg-emerald-50 text-emerald-600 border-emerald-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  completed:   'bg-slate-100 text-slate-500 border-slate-200',
  cancelled:   'bg-red-50 text-red-400 border-red-200',
};

const STATUS_LABEL: Record<string, string> = {
  pending:     'Pending',
  accepted:    'Driver Assigned',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};


const hasDriver = (o: RideOrder) =>
  ['accepted', 'in_progress', 'completed'].includes(o.status) && !!o.driver_name;

// ── Driver Profile Bottom Sheet ───────────────────────────────────────────────
interface DriverSheetProps {
  order: RideOrder;
  onClose: () => void;
}

const DriverSheet: React.FC<DriverSheetProps> = ({ order, onClose }) => (
  /* Backdrop */
  <div
    className="fixed inset-0 z-50 flex items-end justify-center"
    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
    onClick={onClose}
  >
    {/* Sheet */}
    <div
      className="w-full max-w-[480px] bg-white rounded-t-3xl shadow-2xl animate-slide-up"
      onClick={e => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2 pb-4">
        <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Your Driver</p>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Avatar + name */}
      <div className="flex flex-col items-center px-5 pb-5 gap-2">
        <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
          <Car className="w-9 h-9 text-white" />
        </div>
        <div className="text-center mt-1">
          <p className="text-xl font-black text-slate-800">{order.driver_name}</p>
          <span className="inline-flex items-center gap-1 mt-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3 h-3" /> Verified Gerak Driver
          </span>
        </div>
      </div>

      {/* Info rows */}
      <div className="mx-4 mb-4 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
        <InfoRow icon={<User className="w-4 h-4 text-slate-400" />}   label="Nama"         value={order.driver_name ?? '—'} />
        <InfoRow icon={<IdCard className="w-4 h-4 text-slate-400" />} label="Driver ID"     value={order.driver_gerak_id ?? '—'} highlight />
        <InfoRow icon={<Phone className="w-4 h-4 text-slate-400" />} label="Phone" value={order.driver_contact ?? '—'} />
        <InfoRow icon={<Car className="w-4 h-4 text-slate-400" />}    label="Car Type"      value={order.driver_vehicle || '—'} />
        <InfoRow icon={<Hash className="w-4 h-4 text-slate-400" />}   label="Plate Number"  value={order.driver_plate || '—'} mono />
      </div>

      {/* Call + WhatsApp */}
      {order.driver_contact && (
        <div className="px-4 pb-6 flex gap-3">
          <a
            href={`tel:${order.driver_contact}`}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-md active:scale-[0.98] transition"
          >
            <Phone className="w-4 h-4" />
            Call
          </a>
          <WaBtn
            phone={order.driver_contact}
            variant="full"
            label="WhatsApp"
            message={`Hi ${order.driver_name ?? 'Driver'}, I'm your Gerak passenger for the ride on ${order.date} at ${order.time}. 👋`}
          />
        </div>
      )}
    </div>
  </div>
);

const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  suffix?: React.ReactNode;
}> = ({ icon, label, value, highlight, mono, suffix }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <p className={`text-sm font-bold truncate ${
          highlight ? 'text-emerald-600' : mono ? 'text-slate-800 font-mono tracking-widest' : 'text-slate-800'
        }`}>
          {value}
        </p>
        {suffix}
      </div>
    </div>
  </div>
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const secsLeft = (o: RideOrder) =>
  Math.max(0, 300 - Math.floor((Date.now() - new Date(o.created_at).getTime()) / 1000));

const canAct = (o: RideOrder) =>
  secsLeft(o) > 0 && ['pending', 'accepted'].includes(o.status);

const fmtCountdown = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ── Main page ─────────────────────────────────────────────────────────────────
export const MyOrders: React.FC = () => {
  const { user, addNotification, setCurrentPage } = useApp();
  const [orders, setOrders]         = useState<RideOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState('');
  const [sheetOrder, setSheetOrder] = useState<RideOrder | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [, forceUpdate]             = useState(0);
  const prevStatuses                = useRef<Record<string, string>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const load = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setLoading(false); return; }

    const { data } = await supabase
      .from('ride_orders')
      .select('*')
      .eq('customer_id', authUser.id)
      .order('created_at', { ascending: false });

    const rows = data ?? [];

    rows.forEach(o => {
      const prev = prevStatuses.current[o.id];
      if (prev && prev !== o.status) {
        if (o.status === 'accepted') {
          showToast(`Driver assigned! ${o.driver_name ?? 'Your driver'} is on the way.`);
          addNotification(
            'Driver Assigned',
            `${o.driver_name ?? 'A driver'} has accepted your ride on ${o.date} at ${o.time}.`,
            'transport',
          );
        }
        if (o.status === 'in_progress') showToast('Your trip has started!');
        if (o.status === 'completed') {
          showToast('Trip completed. Thank you for riding with Gerak!');
          addNotification(
            'Trip Completed',
            `Your ride on ${o.date} at ${o.time} has been completed.`,
            'transport',
          );
        }
      }
      prevStatuses.current[o.id] = o.status;
    });

    if (Object.keys(prevStatuses.current).length === 0) {
      rows.forEach(o => { prevStatuses.current[o.id] = o.status; });
    }

    setOrders(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('my_orders_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_orders' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_orders' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Tick every second while any order is within the action window
  useEffect(() => {
    if (!orders.some(canAct)) return;
    const id = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [orders]);

  const handleCancel = async (o: RideOrder) => {
    if (cancellingId) return;
    setCancellingId(o.id);
    const { data, error } = await supabase.rpc('cancel_customer_order', { p_order_id: o.id });
    setCancellingId(null);
    if (error || !data?.success) {
      showToast(data?.error ?? error?.message ?? 'Could not cancel order.');
    } else {
      showToast('Order cancelled.');
      load();
    }
  };

  const handleEdit = async (o: RideOrder) => {
    if (o.status === 'accepted') {
      showToast('A driver has already accepted your ride — it cannot be edited.');
      return;
    }
    setCancellingId(o.id);
    const { data } = await supabase.rpc('cancel_customer_order', { p_order_id: o.id });
    setCancellingId(null);
    if (data?.success) {
      setCurrentPage('transport');
    } else {
      showToast(data?.error ?? 'Could not edit order.');
    }
  };

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 animate-fade-in">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-40 bg-slate-800 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg text-center leading-relaxed">
          {toast}
        </div>
      )}

      {/* Driver profile sheet */}
      {sheetOrder && (
        <DriverSheet order={sheetOrder} onClose={() => setSheetOrder(null)} />
      )}

      <div className="px-4 pt-5 pb-3">
        <h2 className="text-xl font-black text-slate-800">My Orders</h2>
        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{user.name} · {user.gerakId}</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-8 gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-black text-slate-600">No orders yet</p>
          <p className="text-xs text-slate-400 font-semibold text-center">
            Your booking history will appear here once you make a ride.
          </p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="px-4 flex flex-col gap-3">
          {orders.map(o => (
            <div key={o.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">

              {/* Status + date */}
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${STATUS_STYLE[o.status] ?? STATUS_STYLE.cancelled}`}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {new Date(o.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {/* Receipt */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1.5 leading-relaxed">
                <OrderReceiptBlock order={o} />

                {/* Driver row — tappable, single line */}
                {hasDriver(o) && (
                  <>
                    <div className="border-t border-dashed border-slate-200 my-1" />
                    <button
                      type="button"
                      onClick={() => setSheetOrder(o)}
                      className="w-full flex items-center gap-1 text-left active:opacity-60 transition"
                    >
                      <span className="text-slate-400 shrink-0">Accepted by:</span>
                      <span className="text-emerald-600 font-bold truncate flex-1 min-w-0">
                        {o.driver_gerak_id ?? o.driver_name}
                      </span>
                      <span className="shrink-0 ml-1 text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-extrabold">
                        View
                      </span>
                    </button>
                  </>
                )}
              </div>

              {/* 5-minute action window */}
              {canAct(o) && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] font-semibold px-0.5">
                    <span className="text-slate-400">Quick actions</span>
                    <span className="font-mono text-primary">{fmtCountdown(secsLeft(o))} left</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(o)}
                      disabled={!!cancellingId}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-extrabold text-xs py-2.5 rounded-xl transition active:scale-[0.98] disabled:opacity-40"
                    >
                      Edit Booking
                    </button>
                    <button
                      onClick={() => setCurrentPage('transport')}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white font-extrabold text-xs py-2.5 rounded-xl shadow-md shadow-primary/20 transition active:scale-[0.98]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      New Booking
                    </button>
                  </div>

                  <button
                    onClick={() => handleCancel(o)}
                    disabled={!!cancellingId}
                    className="w-full flex items-center justify-center gap-1.5 border border-red-200 text-red-500 bg-red-50 font-extrabold text-xs py-2.5 rounded-xl transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {cancellingId === o.id ? (
                      <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel Order
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
