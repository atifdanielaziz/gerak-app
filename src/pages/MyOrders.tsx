import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  ClipboardList, Car, Phone, X, IdCard,
  User, Hash, ShieldCheck, XCircle, RotateCcw,
} from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';
import { ReceiptHeader, ReceiptCard } from '../components/Receipt';
import { buildTransportReceiptRows } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';

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
  aerbus_direction: string | null;
  aerbus_customer_time: string | null;
  status: string;
  cancel_reason: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  driver_vehicle: string | null;
  driver_plate: string | null;
  driver_gerak_id: string | null;
  created_at: string;
}

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
    onPointerDown={(e) => { e.preventDefault(); onClose(); }}
  >
    {/* Sheet */}
    <div
      className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl animate-slide-up flex flex-col"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
        <p className="text-sm font-bold text-slate-700">Your Driver</p>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 pb-5 gap-2">
          <div className="w-20 h-20 rounded-full bg-emerald-600 flex items-center justify-center">
            <Car className="w-9 h-9 text-white" />
          </div>
          <div className="text-center mt-1">
            <p className="text-xl font-semibold text-slate-800">{order.driver_name}</p>
            <span className="inline-flex items-center gap-1 mt-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-full">
              <ShieldCheck className="w-3 h-3" /> Verified Gerak Driver
            </span>
          </div>
        </div>

        {/* Agreed fare */}
        <div className="mx-4 mb-4 bg-slate-50 rounded-2xl px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-normal">Trip Fare</p>
          <p className={order.fare === 'TBC' ? 'text-xs font-semibold text-slate-400' : 'text-xs font-black text-slate-800'}>
            {order.fare === 'TBC' ? 'Awaiting confirmation' : `RM${(Number(order.fare) + (order.night_charge ?? 0)).toFixed(2)}`}
          </p>
        </div>

        {/* Info rows */}
        <div className="mx-4 mb-4 bg-white border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
          <InfoRow icon={<User className="w-4 h-4 text-slate-400" />}   label="Nama"         value={order.driver_name ?? '—'} />
          <InfoRow icon={<IdCard className="w-4 h-4 text-slate-400" />} label="Driver ID"     value={order.driver_gerak_id ?? '—'} highlight />
          <InfoRow icon={<Phone className="w-4 h-4 text-slate-400" />} label="Phone" value={order.driver_contact ?? '—'} />
          <InfoRow icon={<Car className="w-4 h-4 text-slate-400" />}    label="Car Type"      value={order.driver_vehicle || '—'} />
          <InfoRow icon={<Hash className="w-4 h-4 text-slate-400" />}   label="Plate Number"  value={order.driver_plate || '—'} mono />
        </div>
      </div>

      {/* Call + WhatsApp — sticky footer, always reachable */}
      {order.driver_contact && (
        <div className="px-4 pt-3 pb-6 flex gap-3 shrink-0 border-t border-slate-100">
          <a
            href={`tel:${order.driver_contact}`}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition"
          >
            <Phone className="w-4 h-4" />
            Call
          </a>
          <WaBtn
            phone={order.driver_contact}
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
      <p className="text-xs font-semibold text-slate-400">{label}</p>
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
// Actionable for as long as the order is still pending or accepted — no time
// limit; cancel_customer_order's own status checks are the real gate (blocks
// once a driver has accepted, same as this always did server-side).
const canAct = (o: RideOrder) =>
  ['pending', 'accepted'].includes(o.status);

// Before-the-fact heads-up for a still-pending order — reassurance in the
// first minute, then a concrete auto-cancel deadline for the last 10 of the
// 30-minute window (mirrors the server's own ride-orders-expire-pending
// cutoff). Pure client-side read of created_at; no extra network calls.
const pendingBanner = (o: RideOrder, now: number): { tone: 'accent' | 'warn'; text: string } | null => {
  if (o.status !== 'pending') return null;
  const createdMs = new Date(o.created_at).getTime();
  const elapsedMin = (now - createdMs) / 60000;
  if (elapsedMin < 1) {
    return { tone: 'accent', text: 'Just placed — finding you a driver.' };
  }
  if (elapsedMin >= 20) {
    const deadline = new Date(createdMs + 30 * 60000);
    const hh = deadline.getHours().toString().padStart(2, '0');
    const mm = deadline.getMinutes().toString().padStart(2, '0');
    return { tone: 'warn', text: `Still waiting for a driver — may auto-cancel by ${hh}:${mm} if none respond.` };
  }
  return null;
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const MyOrders: React.FC = () => {
  const { user, addNotification, setCurrentPage, setSheetOpen } = useApp();
  const [orders, setOrders]         = useState<RideOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState('');
  const [sheetOrderId, setSheetOrderId] = useState<string | null>(null);
  const sheetOrder = orders.find(o => o.id === sheetOrderId) ?? null;

  // Report to AppContext whenever this sheet is open, so BottomNav hides itself.
  useEffect(() => {
    if (!sheetOrderId) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [sheetOrderId, setSheetOpen]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const prevStatuses                = useRef<Record<string, string>>({});

  // Ticks every 30s purely to re-evaluate pendingBanner()'s elapsed-time
  // thresholds — no network call, just a re-render so "just placed"/"may
  // auto-cancel soon" flip on schedule instead of only when unrelated
  // realtime activity happens to re-render this page.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

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
        // cancel_reason is only ever set by the 30-minute auto-expire cron —
        // customer self-cancel and admin force-cancel both leave it null, so
        // this can't fire for a cancellation the customer already knows about.
        if (o.status === 'cancelled' && o.cancel_reason) {
          showToast('No driver was found for your ride request.');
          addNotification(
            'No Driver Found',
            `Your ride request for ${o.date}, ${o.time} didn't get accepted in time and was cancelled. Feel free to try again.`,
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

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('my_orders_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_orders' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_orders' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);


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
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-40 bg-slate-800 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg text-center leading-relaxed">
          {toast}
        </div>
      )}

      {/* Driver profile sheet */}
      {sheetOrder && (
        <DriverSheet order={sheetOrder} onClose={() => setSheetOrderId(null)} />
      )}

      <div className="px-4 pt-5 pb-3">
        <h2 className="text-xl font-bold text-slate-800">My Orders</h2>
        <p className="text-xs text-slate-400 font-normal mt-0.5">{user.name} · {user.gerakId}</p>
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
          <p className="text-sm font-bold text-slate-600">No orders yet</p>
          <p className="text-xs text-slate-400 font-normal text-center">
            Your booking history will appear here once you make a ride.
          </p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="px-4 flex flex-col gap-4">
          {orders.map(o => {
            const doc = buildTransportReceiptRows(o);
            return (
            <div key={o.id} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

              <ReceiptHeader meta={doc} />

              <ReceiptCard
                doc={doc}
                onSavePdf={o.status === 'completed' ? () => generateReceiptPdf(doc) : undefined}
              >
                {/* Driver row — tappable, single line */}
                {hasDriver(o) && (
                  <>
                    <div className="border-t border-dashed border-slate-200 my-1" />
                    <button
                      type="button"
                      onClick={() => setSheetOrderId(o.id)}
                      className="w-full flex items-center gap-1 text-left active:opacity-60 transition"
                    >
                      <span className="text-slate-400 shrink-0">Accepted by:</span>
                      <span className="text-emerald-600 font-bold truncate flex-1 min-w-0">
                        {o.driver_gerak_id ?? o.driver_name}
                      </span>
                      <span className="shrink-0 ml-1 text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">
                        View
                      </span>
                    </button>
                  </>
                )}
              </ReceiptCard>

              {o.status === 'cancelled' && o.cancel_reason && (
                <p className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 -mt-1">
                  {o.cancel_reason}
                </p>
              )}

              {(() => {
                const banner = pendingBanner(o, Date.now());
                if (!banner) return null;
                return (
                  <p className={`text-xs font-semibold rounded-xl px-3 py-2 -mt-1 ${
                    banner.tone === 'accent'
                      ? 'text-blue-700 bg-blue-50 border border-blue-100'
                      : 'text-amber-700 bg-amber-50 border border-amber-100'
                  }`}>
                    {banner.text}
                  </p>
                );
              })()}

              {canAct(o) && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-normal px-0.5">
                    <span className="text-slate-400">Quick actions</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(o)}
                      disabled={!!cancellingId}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-semibold text-xs py-2.5 rounded-xl transition active:scale-[0.98] disabled:opacity-40"
                    >
                      Edit Booking
                    </button>
                    <button
                      onClick={() => setCurrentPage('transport')}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white font-semibold text-xs py-2.5 rounded-xl shadow-md shadow-primary/20 transition active:scale-[0.98]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      New Booking
                    </button>
                  </div>

                  <button
                    onClick={() => handleCancel(o)}
                    disabled={!!cancellingId}
                    className="w-full flex items-center justify-center gap-1.5 border border-red-200 text-red-500 bg-red-50 font-semibold text-xs py-2.5 rounded-xl transition active:scale-[0.98] disabled:opacity-40"
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
            );
          })}
        </div>
      )}
    </div>
  );
};
