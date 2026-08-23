import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  ClipboardList, Car, Phone, X, IdCard,
  User, Hash, ShieldCheck, XCircle, RotateCcw,
} from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';
import { ReceiptSheet } from '../components/Receipt';
import { buildTransportReceiptRows } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { BOOKING_METHOD_ICON, bookingMethodBadgeClass } from '../lib/bookingMethodIcon';

interface RideOrder {
  id: string;
  driver_id: string | null;
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
  accepted_at: string | null;
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
// Quick actions block is shown for as long as the order is still pending or
// accepted — New Booking is always useful here regardless of the
// cancel/edit deadline below.
const canAct = (o: RideOrder) =>
  ['pending', 'accepted'].includes(o.status);

// Cancel/Edit are only actionable while pending, or within 5 minutes of a
// driver accepting — mirrors cancel_customer_order's own server-side gate
// (which both handleCancel and handleEdit call), and the driver's own
// symmetric 3-minute cancel_ride_order window on the other side.
const CANCEL_GRACE_MS = 5 * 60 * 1000;
const canCancel = (o: RideOrder, now: number): boolean => {
  if (o.status === 'pending') return true;
  if (o.status === 'accepted' && o.accepted_at) {
    return now - new Date(o.accepted_at).getTime() <= CANCEL_GRACE_MS;
  }
  return false;
};
const cancelSecsLeft = (o: RideOrder, now: number): number | null => {
  if (o.status !== 'accepted' || !o.accepted_at) return null;
  const secs = Math.floor((CANCEL_GRACE_MS - (now - new Date(o.accepted_at).getTime())) / 1000);
  return secs > 0 ? secs : null;
};
const fmtCountdown = (secs: number) =>
  `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

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
  // Queue, not just a single `toast` string — a single load() pass can
  // synchronously call showToast() more than once (e.g. two different
  // orders both transitioning status in the same polling/realtime cycle),
  // and a single-string setToast() call was silently overwriting the first
  // before React ever rendered it, losing that pop-up entirely. The
  // persistent Campus Inbox notification for the same event is unaffected
  // (separate, array-based state) — this only fixes the transient toast.
  // The currently-displayed message is just the queue's head (derived
  // during render, not its own state) — the timer below pops it off when
  // its 4s is up, which naturally reveals the next queued message, if any.
  const [toastQueue, setToastQueue] = useState<string[]>([]);
  const toast = toastQueue[0] ?? '';
  const [sheetOrderId, setSheetOrderId] = useState<string | null>(null);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const sheetOrder = orders.find(o => o.id === sheetOrderId) ?? null;
  const receiptOrder = orders.find(o => o.id === receiptOrderId) ?? null;

  // Report to AppContext whenever either sheet is open, so BottomNav hides itself.
  useEffect(() => {
    if (!sheetOrderId && !receiptOrderId) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [sheetOrderId, receiptOrderId, setSheetOpen]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const prevStatuses                = useRef<Record<string, string>>({});
  const prevFares                   = useRef<Record<string, string>>({});
  // Deliberately impure — re-evaluated every render (forceTick below drives
  // a render every 30s) to keep pendingBanner()/canCancel()'s elapsed-time
  // thresholds current, same pattern as OrdersTab.tsx's own `now`.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // Ticks every second purely to re-evaluate pendingBanner()'s elapsed-time
  // thresholds and the Cancel Order countdown — no network call, just a
  // re-render so both stay live instead of only updating when unrelated
  // realtime activity happens to re-render this page. Matches the driver's
  // own 1s cancel-countdown tick in DriverHome.tsx.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg: string) => {
    setToastQueue(q => [...q, msg]);
  };

  // Sole timer, keyed on the displayed message itself (not the queue array),
  // so it only restarts when what's on screen actually changes — queuing a
  // 3rd toast behind an already-showing one can't disturb this timer.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToastQueue(q => q.slice(1)), 4000);
    return () => clearTimeout(id);
  }, [toast]);

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
        // Driver backed out within their own 3-minute window
        // (cancel_ride_order) — the only path that sends an order from
        // accepted back to pending. Without this, the card just silently
        // flips from "Driver Assigned" back to "Pending" with no explanation.
        if (o.status === 'pending' && prev === 'accepted') {
          showToast('Your driver became unavailable — finding you another one.');
          addNotification(
            'Driver Unavailable',
            `Your driver for the ${o.date}, ${o.time} ride became unavailable. We're finding you another driver.`,
            'transport',
          );
        }
      }
      prevStatuses.current[o.id] = o.status;

      // Fare-only change — status stays 'accepted', so the block above never
      // fires for this. A driver setting the price on a TBC booking is the
      // only way this happens (set_ride_fare only runs while accepted/
      // in_progress), so this can't misfire for anything else.
      const prevFare = prevFares.current[o.id];
      if (prevFare === 'TBC' && o.fare !== 'TBC' && ['accepted', 'in_progress'].includes(o.status)) {
        showToast(`Your driver set the fare to RM${Number(o.fare).toFixed(2)}.`);
        addNotification(
          'Price Set',
          `Your driver has set the fare to RM${Number(o.fare).toFixed(2)} for your ride on ${o.date} at ${o.time}.`,
          'transport',
        );
      }
      prevFares.current[o.id] = o.fare;
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let onVisible: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || cancelled) return;

      // Server-side filter (not just the .eq('customer_id', ...) on the
      // read in load()) — without it, this subscription fired a full
      // reload for every order change from EVERY customer, not just this
      // one, in every open MyOrders tab across the whole app.
      channel = supabase
        .channel('my_orders_realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_orders', filter: `customer_id=eq.${authUser.id}` }, () => load())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_orders', filter: `customer_id=eq.${authUser.id}` }, () => load())
        .subscribe();

      // Safety net — the realtime WebSocket can silently drop (app
      // backgrounded, screen locked, network switch) and does NOT replay
      // missed events on reconnect, it only resumes listening forward. A
      // status change that happened while disconnected (e.g. a driver
      // accepting or completing the ride) would otherwise stay stale
      // indefinitely. A 20s poll plus an immediate refresh when the app
      // comes back to the foreground bounds how long that staleness can last.
      pollId = setInterval(() => load(), 20_000);
      onVisible = () => { if (document.visibilityState === 'visible') load(); };
      document.addEventListener('visibilitychange', onVisible);
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      if (pollId) clearInterval(pollId);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
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
      {receiptOrder && (() => {
        const doc = buildTransportReceiptRows(receiptOrder, { showCreatedTime: true });
        return (
          <ReceiptSheet
            doc={doc}
            onClose={() => setReceiptOrderId(null)}
            onSavePdf={() => generateReceiptPdf(doc)}
            onDriverClick={hasDriver(receiptOrder) ? () => {
              setReceiptOrderId(null);
              setSheetOrderId(receiptOrder.id);
            } : undefined}
          />
        );
      })()}

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
            const doc = buildTransportReceiptRows(o, { showCreatedTime: true });
            const method = doc.bookingMethod;
            const MethodIcon = method ? BOOKING_METHOD_ICON[method.mode] : null;
            const total = o.fare === 'TBC' ? 'TBC' : `RM${(Number(o.fare) + (o.night_charge ?? 0)).toFixed(2)}`;
            return (
            <div key={o.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
              <button type="button" onClick={() => setReceiptOrderId(o.id)} className="flex flex-col gap-2 text-left active:scale-[0.99] transition-transform">
                {/* Driver row — tappable, single line */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      <Car className="w-3 h-3" /> Gerak
                    </span>
                    {method && MethodIcon && (
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${bookingMethodBadgeClass(method.mode)}`}>
                        <MethodIcon className="w-3 h-3" /> {method.label}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${doc.statusClassName}`}>
                    {doc.statusLabel}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{o.destination}</p>
                  <p className="text-xs text-slate-400 font-normal truncate mt-0.5">from {o.pickup}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-slate-800">{total}</span>
                  <span className="text-xs text-slate-300 font-normal">
                    {new Date(o.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </button>

              {o.status === 'cancelled' && o.cancel_reason && (
                <p className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 -mt-1">
                  {o.cancel_reason}
                </p>
              )}

              {(() => {
                const banner = pendingBanner(o, now);
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

              {canAct(o) && (() => {
                const cancellable = canCancel(o, now);
                const secsLeft = cancelSecsLeft(o, now);
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-normal px-0.5">
                      <span className="text-slate-400">Quick actions</span>
                    </div>

                    <div className="flex gap-2">
                      {cancellable && (
                        <button
                          onClick={() => handleEdit(o)}
                          disabled={!!cancellingId}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-semibold text-xs py-2.5 rounded-xl transition active:scale-[0.98] disabled:opacity-40"
                        >
                          Edit Booking
                        </button>
                      )}
                      <button
                        onClick={() => setCurrentPage('transport')}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white font-semibold text-xs py-2.5 rounded-xl shadow-md shadow-primary/20 transition active:scale-[0.98]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        New Booking
                      </button>
                    </div>

                    {cancellable && (
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
                            Cancel Order{secsLeft !== null ? ` · ${fmtCountdown(secsLeft)}` : ''}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
