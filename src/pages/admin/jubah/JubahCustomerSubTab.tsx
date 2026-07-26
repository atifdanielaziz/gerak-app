import React, { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  Users, RefreshCw, AlertCircle, Copy, Check, Eye, Download, ChevronLeft,
  ExternalLink, BadgeCheck, Trash2, Ban, X, XCircle, CheckCircle2,
} from 'lucide-react';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import { getJubahDocSignedUrl } from '../../../lib/jubahDocs';
import { copyToClipboard } from '../../../lib/clipboard';
import { ReceiptCard } from '../../../components/Receipt';
import { buildJubahReceiptRows, type ReceiptDoc } from '../../../lib/receiptRows';
import {
  JUBAH_STEP_LABEL as JUBAH_STATUS_LABEL, JUBAH_STATUS_STYLE,
  JUBAH_NEXT_LABEL, getJubahProgress, jubahWaMsg,
} from '../../../lib/jubahStatus';
import { generateReceiptPdf } from '../../../lib/receiptPdf';

export type JubahBookingRow = {
  id: string; reference: string; full_name: string; ic_number: string; hp_number: string;
  email: string | null;
  matric_id: string; university: string; campus: string; faculty: string; remark: string;
  rider_name: string | null; rider_phone: string | null; status: string; payment_mode: string; cost: number;
  balance_due: number; balance_paid: boolean; balance_paid_at: string | null; balance_proof_url: string | null;
  initial_paid: boolean; initial_paid_at: string | null;
  delivery_address: string | null;
  docs_path: string | null; payment_path: string | null; oscar_path: string | null;
  skpg_path: string | null; konvo_path: string | null; ic_path: string | null;
  created_at: string;
  needs_reconciliation: boolean; reconciliation_note: string | null;
};

interface JubahCustomerSubTabProps {
  active: boolean;
  bookings: JubahBookingRow[];
  bookingsLoading: boolean;
  setBookings: Dispatch<SetStateAction<JubahBookingRow[]>>;
  reload: () => void;
  // The list/card/details view machine is owned by AdminHome, not this
  // component — the shared Jubah-tab header (overview stats, sub-tab
  // switcher) needs to know "are we on the customer list page" to decide
  // whether to render itself at all, so the state can't live only in here.
  adminView: 'list' | 'card' | 'details';
  selected: JubahBookingRow | null;
  setSelected: Dispatch<SetStateAction<JubahBookingRow | null>>;
  onGoToCard: (b: JubahBookingRow) => void;
  onGoToDetails: () => void;
  onGoBack: () => void;
  // Distinct from onGoBack (browser history.back()) — used after a delete,
  // when there's no page to "go back" to since the booking it referred to
  // no longer exists. Resets straight to the list, matching the original
  // setJubahAdminView('list'); setJubahAdminSelected(null); pairing exactly.
  onGoToList: () => void;
  showToast: (msg: string) => void;
  onModalOpenChange: (open: boolean) => void;
}

// Jubah customer booking directory — list, per-booking status card, and
// read-only details page — split out of AdminHome.tsx. The largest and most
// business-critical piece of this refactor (real bookings, real payments,
// cancellations), so kept as a single cohesive component rather than
// fragmented across list/card/details files — those three views share one
// tightly-coupled navigation state machine that's clearer kept together.
export function JubahCustomerSubTab({
  bookings, bookingsLoading, setBookings, reload,
  adminView, selected, setSelected, onGoToCard, onGoToDetails, onGoBack, onGoToList,
  showToast, onModalOpenChange,
}: JubahCustomerSubTabProps) {
  const [jubahSearch, setJubahSearch] = useState('');
  const [jubahPayFilter, setJubahPayFilter] = useState<'all' | 'booked' | 'paid' | 'cancelled'>('all');
  const [jubahAdminUpdating, setJubahAdminUpdating] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedListRef, setCopiedListRef] = useState<string | null>(null);
  const [receiptModal, setReceiptModal] = useState<ReceiptDoc | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<JubahBookingRow | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [deletingBooking, setDeletingBooking] = useState<string | null>(null);
  const [confirmingBooking, setConfirmingBooking] = useState(false);

  // Only receiptModal is tracked here — cancelModalBooking was never part of
  // the "any sheet open" check in the original code (a pre-existing gap,
  // not something to silently fix as part of this refactor).
  useEffect(() => {
    onModalOpenChange(!!receiptModal);
  }, [receiptModal, onModalOpenChange]);

  const handleDeleteJubahBooking = async (b: JubahBookingRow) => {
    if (!window.confirm(`Delete booking ${b.reference} for ${b.full_name}? This cannot be undone.`)) return;
    setDeletingBooking(b.id);
    const { error } = await supabase.from('jubah_bookings').delete().eq('id', b.id);
    setDeletingBooking(null);
    if (error) showToast('Delete failed: ' + error.message);
    else { showToast(`${b.reference} deleted.`); setBookings(prev => prev.filter(r => r.id !== b.id)); }
  };

  const handleCancelJubahBooking = async () => {
    if (!cancelModalBooking) return;
    setCancellingBooking(true);
    const { data, error } = await supabase.rpc('cancel_jubah_booking_admin', {
      p_booking_id: cancelModalBooking.id,
    });
    setCancellingBooking(false);
    if (error || !data?.success) {
      showToast(data?.error ?? error?.message ?? 'Cancel failed. Please try again.');
      return;
    }
    const updated = { ...cancelModalBooking, status: 'cancelled' };
    setBookings(prev => prev.map(r => r.id === updated.id ? updated : r));
    if (selected?.id === updated.id) setSelected(updated);
    showToast(`${cancelModalBooking.reference} cancelled.`);
    setCancelModalBooking(null);
  };

  // Best-effort, same as the ToyyibPay-callback path this replaces — a
  // failed email should never undo or block a payment confirmation that's
  // already committed to the database by the time this runs.
  const sendReceiptEmail = async (bookingId: string, stage: 'full' | 'deposit' | 'balance') => {
    try {
      const { data, error } = await supabase.functions.invoke('send-jubah-receipt-email', {
        body: { bookingId, stage },
      });
      if (error || !data?.success) console.error('send-jubah-receipt-email failed:', error ?? data?.reason);
    } catch (err) {
      console.error('send-jubah-receipt-email failed:', err);
    }
  };

  const handleConfirmJubahBooking = async () => {
    if (!selected) return;
    const b = selected;
    setConfirmingBooking(true);

    if (b.payment_mode === 'deposit' && b.status !== 'ordered' && !b.balance_paid) {
      // State 2: confirm balance payment for deposit
      const { data } = await supabase.rpc('mark_jubah_balance_paid', { p_booking_id: b.id });
      if (data?.success) {
        const updated = { ...b, balance_paid: true };
        setSelected(updated);
        setBookings(prev => prev.map(r => r.id === b.id ? updated : r));
        showToast('Balance confirmed ✓');
        sendReceiptEmail(b.id, 'balance');
      } else {
        showToast('Failed to confirm balance.');
      }
    } else if (b.status === 'ordered') {
      // State 1: confirm initial payment — deposit→booked, others→paid
      const newStatus = b.payment_mode === 'deposit' ? 'booked' : 'paid';
      const { data, error } = await supabase.rpc('update_jubah_booking_status', {
        p_booking_id: b.id,
        p_status:     newStatus,
      });
      if (error || !data?.success) {
        showToast('Failed to confirm payment.');
      } else {
        const updated = { ...b, status: newStatus };
        setSelected(updated);
        setBookings(prev => prev.map(r => r.id === b.id ? updated : r));
        showToast(b.payment_mode === 'deposit' ? 'Deposit confirmed → Booked ✓' : 'Payment confirmed → Paid ✓');
        sendReceiptEmail(b.id, b.payment_mode === 'deposit' ? 'deposit' : 'full');
      }
    }
    setConfirmingBooking(false);
  };

  const handleAdminAdvanceStatus = async () => {
    if (!selected) return;
    const next = getJubahProgress(selected.status, selected.payment_mode).nextStatus;
    if (!next) return;
    setJubahAdminUpdating(true);
    const { data, error } = await supabase.rpc('update_jubah_booking_status', {
      p_booking_id: selected.id,
      p_status:     next,
    });
    if (error || !data?.success) {
      showToast('Update failed. Please try again.');
    } else {
      const updated = { ...selected, status: next };
      setSelected(updated);
      setBookings(prev => prev.map(r => r.id === selected.id ? updated : r));
      showToast(`Status updated: ${JUBAH_STATUS_LABEL[next] ?? next}`);
    }
    setJubahAdminUpdating(false);
  };

  return (
    <>
      {adminView === 'list' && (<>

        {/* Search bar */}
        <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
          <div className="flex gap-2">
            <input type="text" value={jubahSearch} onChange={e => setJubahSearch(e.target.value)}
              placeholder="Search by name, phone or reference…"
              style={{ fontSize: '12px' }}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal placeholder:text-slate-300"
            />
            <button onClick={() => { setJubahSearch(''); setJubahPayFilter('all'); }}
              disabled={!jubahSearch.trim() && jubahPayFilter === 'all'}
              className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-40 flex items-center gap-1.5">
              Clear
            </button>
            <button onClick={reload}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-primary transition active:scale-90 shrink-0">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Payment status filter */}
          <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
            {([
              { id: 'all',       label: 'All' },
              { id: 'booked',    label: 'Booked' },
              { id: 'paid',      label: 'Paid' },
              { id: 'cancelled', label: 'Cancelled' },
            ] as const).map(f => (
              <button key={f.id} onPointerDown={e => { e.preventDefault(); setJubahPayFilter(f.id); }}
                className={`flex-1 py-1.5 rounded-[10px] text-xs font-semibold transition-transform active:scale-95 ${
                  jubahPayFilter === f.id ? 'bg-white text-slate-800' : 'text-slate-400'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer bookings table */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> Customer Directory</span>
            <span className="font-normal text-slate-300 normal-case tracking-normal">
              {bookings.filter(b => {
                // payment_mode !== 'deposit' alone is NOT "paid" — it just means
                // "not deposit mode," true for a pickup/postage booking that's
                // never been paid at all (still status='ordered'). initial_paid is
                // the actual fact to check for non-deposit modes, same formula
                // RiderHome already uses correctly.
                const isPaid = b.payment_mode === 'deposit' ? b.balance_paid : b.initial_paid;
                const isCancelled = b.status === 'cancelled';
                const matchFilter =
                  jubahPayFilter === 'all'       ? true :
                  jubahPayFilter === 'cancelled' ? isCancelled :
                  jubahPayFilter === 'paid'       ? (isPaid && !isCancelled) :
                                                     (!isPaid && !isCancelled);
                const q = jubahSearch.trim().toLowerCase();
                const matchSearch = !q || b.full_name.toLowerCase().includes(q) || b.hp_number.includes(q) || b.reference.toLowerCase().includes(q);
                return matchFilter && matchSearch;
              }).length} bookings
            </span>
          </h3>

          {bookingsLoading ? (
            <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>
          ) : bookings.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold text-center py-6">No Jubah bookings yet.</p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[600px]">
              <table className="min-w-full border-collapse text-left">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs font-normal text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-4 whitespace-nowrap">Reference</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Name</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Remark</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Mode</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Type</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Status</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Robe Status</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Confirm</th>
                    <th className="py-2 whitespace-nowrap">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.filter(b => {
                    const isPaid = b.payment_mode === 'deposit' ? b.balance_paid : b.initial_paid;
                    const isCancelled = b.status === 'cancelled';
                    const matchFilter =
                      jubahPayFilter === 'all'       ? true :
                      jubahPayFilter === 'cancelled' ? isCancelled :
                      jubahPayFilter === 'paid'       ? (isPaid && !isCancelled) :
                                                         (!isPaid && !isCancelled);
                    const q = jubahSearch.trim().toLowerCase();
                    const matchSearch = !q || b.full_name.toLowerCase().includes(q) || b.hp_number.includes(q) || b.reference.toLowerCase().includes(q);
                    return matchFilter && matchSearch;
                  }).map(b => {
                    const isPaid = b.payment_mode === 'deposit' ? b.balance_paid : b.initial_paid;
                    return (
                      <tr key={b.id}
                        onClick={() => onGoToCard(b)}
                        className="border-b border-slate-100 text-xs hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer">
                        <td className="py-2.5 pr-4 font-mono font-semibold text-primary whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {b.needs_reconciliation && (
                              <span title={b.reconciliation_note ?? 'Needs reconciliation'}>
                                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              </span>
                            )}
                            {b.reference}
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!(await copyToClipboard(b.reference))) return;
                                setCopiedListRef(b.id);
                                setTimeout(() => setCopiedListRef(prev => prev === b.id ? null : prev), 2000);
                              }}
                              className="text-slate-300 hover:text-primary transition active:scale-90 shrink-0"
                            >
                              {copiedListRef === b.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-slate-800 whitespace-nowrap">{b.full_name}</td>
                        <td className="py-2.5 pr-4 text-slate-500 font-semibold whitespace-nowrap">{b.remark}</td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${
                            b.payment_mode === 'deposit' && !b.balance_paid ? 'bg-amber-50 border-amber-100 text-amber-700' :
                            'bg-blue-50 border-blue-100 text-blue-700'
                          }`}>
                            {b.payment_mode !== 'deposit' ? 'Full Payment' : b.balance_paid ? 'Full Payment (DP)' : 'Deposit'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {/* Independent of payment_mode — deposit mode can't distinguish this on
                              its own (it's literally 'deposit' for both delivery methods), so this
                              checks deliveryAddress the same way buildJubahReceiptRows now does. */}
                          <span className="font-semibold px-2 py-0.5 rounded-full border text-xs bg-slate-50 border-slate-200 text-slate-600">
                            {(b.payment_mode === 'postage' || (b.payment_mode === 'deposit' && !!b.delivery_address)) ? 'Postage' : 'Pickup'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${
                            b.status === 'cancelled' ? 'bg-red-50 border-red-100 text-red-600' :
                            isPaid ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
                          }`}>
                            {b.status === 'cancelled' ? 'Cancelled' : !isPaid ? 'Booked' : 'Full Paid'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {b.status === 'cancelled' ? (
                            <span className="text-slate-300 text-xs">—</span>
                          ) : (
                            <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${JUBAH_STATUS_STYLE[b.status] ?? ''}`}>
                              {JUBAH_STATUS_LABEL[b.status] ?? b.status}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {(() => {
                            // Four states: cancelled (red X — distinct from "just unpaid", since
                            // a cancelled booking will never become paid), nothing paid yet (grey),
                            // deposit paid but balance still outstanding (blue — a real but partial
                            // confirmation, shouldn't look identical to "fully done"), fully paid (green).
                            if (b.status === 'cancelled') {
                              return (
                                <span title="Cancelled">
                                  <XCircle className="w-4 h-4 text-red-500" />
                                </span>
                              );
                            }
                            const depositOnly = b.payment_mode === 'deposit' && b.initial_paid && !b.balance_paid;
                            const colorClass = isPaid ? 'text-emerald-500' : depositOnly ? 'text-blue-500' : 'text-slate-200';
                            return (
                              <span title={isPaid ? 'Fully paid' : depositOnly ? 'Deposit paid — balance due' : 'Unpaid'}>
                                <CheckCircle2 className={`w-4 h-4 ${colorClass}`} />
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          {(() => {
                            const buildDoc = () => buildJubahReceiptRows({
                              reference:    b.reference,
                              fullName:     b.full_name,
                              icNumber:     b.ic_number,
                              hpNumber:     b.hp_number,
                              email:        b.email,
                              university:   b.university,
                              faculty:      b.faculty,
                              matricId:     b.matric_id,
                              remark:       b.remark,
                              paymentMode:  b.payment_mode as 'pickup' | 'postage' | 'deposit',
                              cost:         b.cost,
                              balanceDue:   b.balance_due,
                              balancePaid:  b.balance_paid,
                              balancePaidAt: b.balance_paid_at,
                              deliveryAddress: b.delivery_address,
                              status:       b.status,
                              initialPaid:   b.initial_paid,
                              initialPaidAt: b.initial_paid_at,
                              riderName:    b.rider_name,
                              riderPhone:   b.rider_phone,
                              createdAt:    b.created_at,
                            });
                            return (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setReceiptModal(buildDoc()); }}
                                  title="View Receipt"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 active:scale-95 transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); generateReceiptPdf(buildDoc()); }}
                                  title="Download Receipt"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 text-white hover:bg-slate-700 active:scale-95 transition"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      {/* PAGE 2 — Job card with stepper */}
      {adminView === 'card' && selected && (() => {
        const b = selected;
        const { steps, curStep, notStarted, isDone, nextStatus: nextStat } = getJubahProgress(b.status, b.payment_mode);
        return (
          <div className="flex flex-col gap-4">
            {/* Back row — sticky so it stays visible while the content below scrolls */}
            <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-2 bg-white flex items-center gap-2">
              <button onClick={onGoBack}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-primary transition active:scale-90 shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-black text-slate-700">{b.reference}</p>
                  <button
                    onClick={async () => { if (!(await copyToClipboard(b.reference))) return; setCopiedRef(true); setTimeout(() => setCopiedRef(false), 2000); }}
                    className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-primary active:scale-90 transition"
                  >
                    {copiedRef ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 font-semibold">{b.full_name}</p>
              </div>
            </div>

            {/* Status stepper card */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

              {/* Customer summary */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-primary font-semibold">{b.reference}</p>
                  <h3 className="text-base font-black text-slate-800 mt-0.5">{b.full_name}</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    {b.remark} · {b.faculty} · UMPSA {b.campus}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${JUBAH_STATUS_STYLE[b.status] ?? ''}`}>
                  {JUBAH_STATUS_LABEL[b.status] ?? b.status}
                </span>
              </div>

              {/* HP + Mode */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 flex-1">
                  <span className="text-xs font-semibold text-slate-600">{b.hp_number}</span>
                  <a href={`https://wa.me/${toWa(b.hp_number)}?text=${encodeURIComponent(
                    jubahWaMsg(b.full_name, b.status, b.reference, b.payment_mode, b.initial_paid, b.balance_paid, b.balance_due)
                  )}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[#25D366] ml-auto shrink-0">
                    <WaIcon className="w-4 h-4" />
                  </a>
                </div>
                <span className={`text-xs font-semibold px-3 py-2 rounded-xl border shrink-0 ${
                  b.payment_mode === 'deposit'
                    ? (b.balance_paid ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700')
                    : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                }`}>
                  {b.payment_mode === 'deposit' ? (b.balance_paid ? 'Full Paid' : 'Deposit') : 'Full Paid'}
                </span>
              </div>

              {/* Progress stepper */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1">
                  {steps.map((step, i) => (
                    <React.Fragment key={step}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-semibold border-2 transition ${
                        i < curStep  ? 'bg-primary border-primary text-white' :
                        i === curStep ? 'bg-white border-primary text-primary' :
                        'bg-white border-slate-200 text-slate-300'
                      }`}>
                        {i < curStep ? '✓' : i + 1}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-0.5 rounded-full transition ${i < curStep ? 'bg-primary' : 'bg-slate-200'}`} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex justify-between">
                  {steps.map(step => (
                    <span key={step} className="text-[8px] font-semibold text-slate-400 flex-1 text-center first:text-left last:text-right">
                      {JUBAH_STATUS_LABEL[step]}
                    </span>
                  ))}
                </div>
              </div>

              {/* Delivery address (postage only) */}
              {b.payment_mode === 'postage' && b.delivery_address && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-[8px] font-semibold text-blue-400 mb-1">Delivery Address</p>
                  <p className="text-xs font-semibold text-blue-800 leading-relaxed">{b.delivery_address}</p>
                </div>
              )}

              {/* Balance status (deposit) — hidden once cancelled (nothing left to
                  collect) or before the deposit itself is even paid (notStarted):
                  showing "Balance Due RM45" implies that's all that's left, when
                  really the RM25 deposit hasn't been paid either yet. */}
              {b.payment_mode === 'deposit' && b.status !== 'cancelled' && !notStarted && (
                <div className="flex items-center gap-2">
                  <div className={`flex-1 rounded-xl p-3 border flex items-center justify-between gap-2 ${
                    b.balance_paid ? 'bg-emerald-50 border-emerald-100' : b.balance_proof_url ? 'bg-violet-50 border-violet-100' : 'bg-amber-50 border-amber-100'
                  }`}>
                    <div>
                      <span className={`text-[8px] font-semibold uppercase tracking-wider block ${
                        b.balance_paid ? 'text-emerald-500' : b.balance_proof_url ? 'text-violet-500' : 'text-amber-500'
                      }`}>
                        {b.balance_paid ? 'Balance Paid' : b.balance_proof_url ? 'Proof Submitted — Review' : 'Balance Due'}
                      </span>
                      <span className={`text-base font-black ${
                        b.balance_paid ? 'text-emerald-700' : b.balance_proof_url ? 'text-violet-700' : 'text-amber-700'
                      }`}>
                        RM{b.balance_due.toFixed(2)}
                      </span>
                    </div>
                    {b.balance_proof_url && (
                      <button
                        type="button"
                        onClick={async () => {
                          const win = window.open('', '_blank', 'noopener,noreferrer');
                          const signed = await getJubahDocSignedUrl(b.balance_proof_url);
                          if (signed && win) win.location.href = signed;
                          else win?.close();
                        }}
                        className="text-xs text-blue-500 font-semibold flex items-center gap-0.5 hover:underline shrink-0"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> proof
                      </button>
                    )}
                  </div>
                  {b.balance_proof_url && !b.balance_paid && (
                    <button
                      type="button"
                      onClick={async () => {
                        const { data } = await supabase.rpc('mark_jubah_balance_paid', { p_booking_id: b.id });
                        if (data?.success) {
                          const updated = { ...b, balance_paid: true };
                          setBookings(prev => prev.map(r => r.id === b.id ? updated : r));
                          setSelected(updated);
                          showToast('Balance confirmed ✓');
                        } else {
                          showToast('Failed to confirm balance.');
                        }
                      }}
                      title="Confirm balance payment"
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-90 transition text-white shrink-0"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {/* status='ordered' — payment hasn't even been confirmed yet, so there's
                  nothing here to advance or call "complete." That's normally handled
                  automatically by the ToyyibPay callback; this is just a graceful
                  fallback for viewing a booking's card before that's happened. */}
              {notStarted && b.status !== 'cancelled' && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-center">
                  <p className="text-xs font-semibold text-slate-500">Awaiting Payment Confirmation</p>
                </div>
              )}
              {/* Advance status button — deposit bookings stay gated until the balance is confirmed above */}
              {!notStarted && !isDone && b.status !== 'cancelled' && (() => {
                const balanceGateActive = b.payment_mode === 'deposit' && !b.balance_paid;
                return (
                  <button
                    onClick={handleAdminAdvanceStatus}
                    disabled={jubahAdminUpdating || balanceGateActive}
                    className="w-full bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-2xl transition flex items-center justify-center gap-2 text-sm">
                    {jubahAdminUpdating
                      ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      : balanceGateActive
                        ? 'Awaiting Balance Payment'
                        : `→ ${JUBAH_NEXT_LABEL[nextStat ?? ''] ?? `Mark ${JUBAH_STATUS_LABEL[nextStat ?? '']}`}`}
                  </button>
                );
              })()}
              {isDone && b.status !== 'cancelled' && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
                  <p className="text-xs font-semibold text-emerald-700">✓ Delivery Complete</p>
                </div>
              )}
            </div>

            {/* View Customer Details button */}
            <button
              onClick={onGoToDetails}
              className="w-full bg-white border border-slate-100 text-slate-600 font-semibold py-3 rounded-2xl text-sm transition active:scale-95 active:bg-slate-50">
              View Customer Details →
            </button>
          </div>
        );
      })()}

      {/* PAGE 3 — Customer details (read-only form + downloads) */}
      {adminView === 'details' && selected && (() => {
        const b = selected;
        return (
          <div className="flex flex-col gap-4">
            {/* Back row — sticky so it stays visible while the content below scrolls */}
            <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-2 bg-white flex items-center gap-2">
              <button onClick={onGoBack}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-primary transition active:scale-90 shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <p className="text-xs font-black text-slate-700">Customer Info</p>
                <p className="text-xs text-slate-400 font-semibold">{b.remark} · {b.university}</p>
              </div>
            </div>

            {/* Form fields card */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700">Booking Information</h3>

              {([
                { label: 'Full Name',     value: b.full_name },
                { label: 'IC Number',      value: b.ic_number },
                { label: 'Phone',          value: b.hp_number },
                { label: 'Matric No.',     value: b.matric_id },
                { label: 'University',     value: b.university },
                { label: 'Campus',         value: `UMPSA ${b.campus}` },
                { label: 'Faculty',        value: b.faculty },
                { label: 'Remark',         value: b.remark },
                { label: 'Booking Type',   value: b.delivery_address ? 'Pickup & Postage' : 'Self Pickup' },
                { label: 'Payment Mode',   value: b.payment_mode !== 'deposit' ? 'Full Payment' : b.balance_paid ? 'Full Payment (DP)' : 'Deposit' },
                { label: 'Service Fee',    value: `RM${b.cost.toFixed(2)}` },
                ...(b.payment_mode === 'deposit' ? [{ label: 'Balance Due', value: `RM${b.balance_due.toFixed(2)}` }] : []),
                ...(b.delivery_address ? [{ label: 'Delivery Address', value: b.delivery_address }] : []),
                { label: 'Rider Assigned', value: b.rider_name ?? '—' },
                { label: 'Reference',      value: b.reference },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <span className="text-xs font-normal text-slate-400">{label}</span>
                  <span className="text-sm font-semibold text-slate-700 leading-relaxed">{value}</span>
                </div>
              ))}
            </div>

            {/* Receipt — same component/PDF export customers see, built
                directly from data already loaded here (no extra fetch). */}
            {(() => {
              const doc = buildJubahReceiptRows({
                reference:    b.reference,
                fullName:     b.full_name,
                icNumber:     b.ic_number,
                hpNumber:     b.hp_number,
                email:        b.email,
                university:   b.university,
                faculty:      b.faculty,
                matricId:     b.matric_id,
                remark:       b.remark,
                paymentMode:  b.payment_mode as 'pickup' | 'postage' | 'deposit',
                cost:         b.cost,
                balanceDue:   b.balance_due,
                balancePaid:  b.balance_paid,
                balancePaidAt: b.balance_paid_at,
                deliveryAddress: b.delivery_address,
                status:       b.status,
                initialPaid:   b.initial_paid,
                initialPaidAt: b.initial_paid_at,
                riderName:    b.rider_name,
                riderPhone:   b.rider_phone,
                createdAt:    b.created_at,
              });
              return <ReceiptCard doc={doc} onSavePdf={() => generateReceiptPdf(doc)} />;
            })()}

            {/* Documents download card */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700">Documents</h3>

              {([
                { label: 'Combined PDF',  url: b.docs_path },
                { label: 'Payment Proof', url: b.payment_path },
                { label: 'OSCAR',         url: b.oscar_path },
                { label: 'SKPG',          url: b.skpg_path },
                { label: 'Konvo Slip',    url: b.konvo_path },
                { label: 'IC Copy',       url: b.ic_path },
                ...(b.payment_mode === 'deposit' ? [{ label: 'Balance Proof', url: b.balance_proof_url }] : []),
              ] as { label: string; url: string | null }[]).map(({ label, url }) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* View — signed URL generated on demand, not stored.
                        Window is opened synchronously (before the await) so
                        it stays inside the tap's user-gesture window — opening
                        it only after the signed URL resolves gets silently
                        blocked as a popup on most mobile browsers. */}
                    <button
                      type="button"
                      disabled={!url}
                      onClick={async () => {
                        const win = window.open('', '_blank', 'noopener,noreferrer');
                        const signed = await getJubahDocSignedUrl(url);
                        if (signed && win) win.location.href = signed;
                        else win?.close();
                      }}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${
                        url
                          ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100 active:scale-95'
                          : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                      }`}>
                      <Eye className="w-4 h-4" />
                    </button>
                    {/* Download — signed URL with download disposition, generated on demand */}
                    <button
                      type="button"
                      disabled={!url}
                      onClick={async () => {
                        const win = window.open('', '_blank', 'noopener,noreferrer');
                        const signed = await getJubahDocSignedUrl(url, true);
                        if (signed && win) win.location.href = signed;
                        else win?.close();
                      }}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl border transition ${
                        url
                          ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700 active:scale-95'
                          : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                      }`}>
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Confirm + Delete row */}
            {(() => {
              // Deliberately not gated on payment_path/balance_proof_url being
              // set — admin can confirm from their own bank statement even if
              // a proof upload failed silently, same as the customer-facing
              // upload never blocking booking on the other documents either.
              const canConfirmPayment = b.status === 'ordered';
              const canConfirmBalance = b.payment_mode === 'deposit' && b.status !== 'ordered' && b.status !== 'cancelled' && !b.balance_paid;
              const confirmActive = canConfirmPayment || canConfirmBalance;
              const confirmLabel  = canConfirmBalance ? 'Confirm Balance' : 'Confirm Payment';
              return (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirmJubahBooking}
                      disabled={!confirmActive || confirmingBooking}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 active:scale-[0.98] font-semibold py-3 rounded-2xl text-sm transition disabled:opacity-40 disabled:cursor-not-allowed">
                      {confirmingBooking
                        ? <span className="w-4 h-4 rounded-full border-2 border-emerald-300 border-t-emerald-600 animate-spin" />
                        : <><BadgeCheck className="w-4 h-4" />{confirmLabel}</>}
                    </button>
                    <button
                      onClick={async () => {
                        onGoToList();
                        await handleDeleteJubahBooking(b);
                      }}
                      disabled={deletingBooking === b.id}
                      className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 active:scale-[0.98] font-semibold py-3 rounded-2xl text-sm transition disabled:opacity-50">
                      {deletingBooking === b.id
                        ? <span className="w-4 h-4 rounded-full border-2 border-red-300 border-t-red-500 animate-spin" />
                        : <><Trash2 className="w-4 h-4" />Delete</>}
                    </button>
                  </div>
                  {b.status !== 'cancelled' && (
                    <button
                      onClick={() => setCancelModalBooking(b)}
                      className="w-full flex items-center justify-center gap-2 border border-amber-200 text-amber-600 hover:bg-amber-50 active:scale-[0.98] font-semibold py-3 rounded-2xl text-sm transition">
                      <Ban className="w-4 h-4" />Cancel Booking
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Receipt Preview Modal ── */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onPointerDown={(e) => { e.preventDefault(); setReceiptModal(null); }}>
          <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
            onPointerDown={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-800">Receipt</h3>
              <button onClick={() => setReceiptModal(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ReceiptCard doc={receiptModal} onSavePdf={() => generateReceiptPdf(receiptModal)} />
          </div>
        </div>
      )}

      {/* ── Cancel Booking Confirmation Modal ── */}
      {cancelModalBooking && (() => {
        const b = cancelModalBooking;
        const unpaid = b.status === 'ordered';
        const fullyPaid = (b.payment_mode !== 'deposit' && !unpaid) || (b.payment_mode === 'deposit' && b.balance_paid);
        const total = b.payment_mode === 'deposit' && b.balance_paid ? b.cost + b.balance_due : b.cost;
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
            onPointerDown={(e) => { e.preventDefault(); if (!cancellingBooking) setCancelModalBooking(null); }}>
            <div className="w-full max-w-sm max-h-[calc(100dvh-3rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
              onPointerDown={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
              <div className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
                unpaid ? 'bg-slate-100' : 'bg-amber-100'
              }`}>
                <Ban className={`w-5 h-5 ${unpaid ? 'text-slate-500' : 'text-amber-600'}`} />
              </div>
              <h3 className="text-sm font-black text-slate-800 text-center mb-1">
                Cancel {b.reference}?
              </h3>
              <p className="text-xs text-slate-400 font-semibold text-center mb-6">
                {unpaid
                  ? 'Nothing has been paid yet, so there\'s nothing to refund.'
                  : fullyPaid
                    ? `This booking was paid in full (RM${total.toFixed(2)}). Cancelling does NOT refund the customer automatically — you'll need to do that yourself.`
                    : 'The RM25 deposit has already been paid. Cancelling forfeits it — no refund is processed automatically.'}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setCancelModalBooking(null)} disabled={cancellingBooking}
                  className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50">
                  No, keep it
                </button>
                <button onClick={handleCancelJubahBooking} disabled={cancellingBooking}
                  className="flex-1 bg-danger font-semibold text-xs py-3 rounded-2xl transition active:scale-95 text-white disabled:opacity-50">
                  {cancellingBooking
                    ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin mx-auto" />
                    : 'Yes, cancel'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
