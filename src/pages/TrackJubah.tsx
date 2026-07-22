import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PackageSearch, Search, GraduationCap, CheckCircle2 } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';
import { ReceiptCard } from '../components/Receipt';
import { buildJubahReceiptRows } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { getPendingJubahBooking, clearPendingJubahBooking } from '../lib/pendingJubahBooking';

interface JubahBookingResult {
  id: string;
  reference: string;
  full_name: string;
  hp_number: string;
  campus: string;
  faculty: string;
  remark: string;
  rider_name: string | null;
  rider_phone: string | null;
  status: string;
  payment_mode: string;
  balance_due: number;
  balance_paid: boolean;
  balance_proof_url: string | null;
  created_at: string;
}

// Full receipt fields — only fetched once the last-4 IC gate passes, kept
// separate from JubahBookingResult so the plain search never returns them.
interface JubahReceiptData {
  id: string;
  reference: string;
  full_name: string;
  ic_number: string | null;
  hp_number: string;
  email: string | null;
  campus: string;
  faculty: string;
  university: string;
  matric_id: string;
  remark: string;
  status: string;
  payment_mode: string;
  rider_name: string | null;
  rider_phone: string | null;
  cost: number;
  balance_due: number;
  balance_paid: boolean;
  balance_paid_at: string | null;
  initial_paid: boolean;
  initial_paid_at: string | null;
  delivery_address: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  booked:     'Order Received',
  processing: 'Processing Documents',
  collected:  'Robe Collected',
  at_hub:     'Delivered to Postage Hub',
  picked_up:  'Picked Up',
  on_the_way: 'On The Way',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_STYLE: Record<string, string> = {
  booked:     'bg-amber-50 border-amber-100 text-amber-700',
  processing: 'bg-violet-50 border-violet-100 text-violet-700',
  collected:  'bg-blue-50 border-blue-100 text-blue-700',
  at_hub:     'bg-emerald-50 border-emerald-100 text-emerald-700',
  picked_up:  'bg-blue-50 border-blue-100 text-blue-700',
  on_the_way: 'bg-violet-50 border-violet-100 text-violet-700',
  delivered:  'bg-emerald-50 border-emerald-100 text-emerald-700',
  cancelled:  'bg-red-50 border-red-100 text-red-600',
};

export const TrackJubah: React.FC = () => {
  const [reference, setReference] = useState('');
  const [matric, setMatric]       = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched]   = useState(false);
  const [results, setResults]     = useState<JubahBookingResult[]>([]);
  const [error, setError]         = useState('');

  // Payment state — id of the booking whose payment is currently in flight,
  // plus a per-booking error so a failure on one card doesn't show up
  // disconnected from it at the top of a multi-result page.
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});

  // Cancel state — id of the booking whose inline confirm is expanded, plus
  // loading/error state, same per-booking pattern as payment.
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId]       = useState<string | null>(null);
  const [cancelErrors, setCancelErrors]       = useState<Record<string, string>>({});

  // Full receipt state — id of the booking whose IC-digit prompt is open,
  // the digits being entered, and (once verified) the fetched receipt data
  // keyed by booking id so each result's receipt unlocks independently.
  const [receiptOpenId, setReceiptOpenId]   = useState<string | null>(null);
  const [icLast4, setIcLast4]               = useState('');
  const [verifyingReceipt, setVerifyingReceipt] = useState(false);
  const [receiptErrors, setReceiptErrors]   = useState<Record<string, string>>({});
  const [receiptData, setReceiptData]       = useState<Record<string, JubahReceiptData>>({});

  const runSearch = async (refOverride?: string) => {
    setError('');
    setResults([]);
    const refValue = (refOverride ?? reference).trim();
    if (!refValue && !matric.trim()) {
      setError('Please enter your reference number or matric / IC number.');
      return;
    }
    setSearching(true);
    setSearched(false);
    const isIc = matric.replace(/\D/g, '').length === 12;
    const { data, error: rpcError } = await supabase.rpc('track_jubah_booking', {
      p_reference:  refValue || null,
      p_hp_number:  null,
      p_matric_id:  (matric.trim() && !isIc) ? matric.trim() : null,
      p_ic_number:  (matric.trim() && isIc)  ? matric.trim() : null,
    });
    setSearching(false);
    setSearched(true);
    if (rpcError) { setError(rpcError.message || 'Something went wrong. Please try again.'); return; }
    const found = (data as JubahBookingResult[]) ?? [];
    setResults(found);

    // They've now seen this booking's status directly — the "unfinished
    // booking" nudge on the landing page has done its job, so stop showing it.
    const pending = getPendingJubahBooking();
    if (pending && found.some(b => b.reference === pending.reference)) {
      clearPendingJubahBooking();
    }
  };

  const handleSearch = (e: React.SyntheticEvent) => {
    e.preventDefault();
    runSearch();
  };

  // ToyyibPay's return URL lands back here with ?reference=... — auto-search
  // so the customer sees their updated status without retyping anything.
  // Internal navigation (e.g. the "Check Status" button on the unfinished-
  // booking nudge) never populates that query param — this is a real SPA,
  // not URL-routed — so fall back to the same pending-booking marker that
  // nudge reads from.
  useEffect(() => {
    const refParam = new URLSearchParams(window.location.search).get('reference');
    const fallbackRef = refParam ? null : getPendingJubahBooking()?.reference ?? null;
    const target = refParam || fallbackRef;
    if (target) {
      const upper = target.toUpperCase();
      setReference(upper);
      runSearch(upper);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async (b: JubahBookingResult, stage: 'initial' | 'balance') => {
    setPayingId(b.id);
    setPayErrors(prev => ({ ...prev, [b.id]: '' }));
    const { data } = await supabase.functions.invoke('toyyibpay-create-bill', {
      body: { reference: b.reference, hp_number: b.hp_number, stage },
    });
    if (data?.success && data?.paymentUrl) {
      window.location.href = data.paymentUrl;
    } else {
      setPayingId(null);
      setPayErrors(prev => ({ ...prev, [b.id]: data?.error ?? 'Could not start payment. Please try again.' }));
    }
  };

  const handleCancelBooking = async (b: JubahBookingResult) => {
    setCancellingId(b.id);
    setCancelErrors(prev => ({ ...prev, [b.id]: '' }));
    const { data, error } = await supabase.rpc('cancel_jubah_booking_customer', {
      p_reference: b.reference,
      p_hp_number: b.hp_number,
    });
    setCancellingId(null);
    if (error || !data?.success) {
      setCancelErrors(prev => ({ ...prev, [b.id]: data?.error ?? error?.message ?? 'Could not cancel. Please try again.' }));
      return;
    }
    setResults(prev => prev.map(r => r.id === b.id ? { ...r, status: 'cancelled' } : r));
    setCancelConfirmId(null);
  };

  const handleVerifyReceipt = async (b: JubahBookingResult) => {
    if (!/^\d{4}$/.test(icLast4)) {
      setReceiptErrors(prev => ({ ...prev, [b.id]: 'Enter the last 4 digits of your IC.' }));
      return;
    }
    setVerifyingReceipt(true);
    setReceiptErrors(prev => ({ ...prev, [b.id]: '' }));
    const { data, error } = await supabase.rpc('get_jubah_receipt', {
      p_reference: b.reference,
      p_ic_last4:  icLast4,
    });
    setVerifyingReceipt(false);
    if (error) {
      setReceiptErrors(prev => ({ ...prev, [b.id]: error.message || 'Something went wrong. Please try again.' }));
      return;
    }
    const row = (data as JubahReceiptData[] | null)?.[0];
    if (!row) {
      setReceiptErrors(prev => ({ ...prev, [b.id]: 'Incorrect IC digits. Please try again.' }));
      return;
    }
    setReceiptData(prev => ({ ...prev, [b.id]: row }));
    setReceiptOpenId(null);
    setIcLast4('');
  };

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 px-5 animate-fade-in flex flex-col gap-5">

      {/* HEADER */}
      <div className="mt-4 px-1 flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <PackageSearch className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold m-0 text-slate-800">Track My Order</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">
            Jubah Delivery Status
          </p>
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">Reference Number</label>
          <input
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value.toUpperCase())}
            placeholder="e.g. JUB-26-UMPSA-XK7F"
            style={{ fontSize: '16px' }}
            className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-xs text-slate-300 font-normal">or</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">Matric or IC Number</label>
          <input
            type="text"
            value={matric}
            onChange={e => setMatric(e.target.value)}
            placeholder="e.g. CB21110 or 980123-45-6789"
            style={{ fontSize: '16px' }}
            className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
          />
        </div>

        {error && (
          <p className="text-xs text-danger font-semibold text-center bg-danger/10 border border-danger/20 rounded-xl py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={searching}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-slate-200 text-white font-semibold py-3 rounded-2xl transition flex items-center justify-center gap-2"
        >
          {searching
            ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <><Search className="w-4 h-4" /> Track Order</>}
        </button>
      </form>

      {/* Results */}
      {searched && (
        results.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 flex flex-col items-center gap-3 text-center">
            <GraduationCap className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-500">No booking found.</p>
            <p className="text-xs text-slate-400 font-normal">Double-check your reference number or matric / IC number and try again.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {results.map(b => {
              const trackSteps = b.payment_mode === 'postage'
                ? ['booked', 'processing', 'collected', 'at_hub']
                : ['booked', 'processing', 'collected', 'delivered'];
              const STEP_LABEL: Record<string, string> = {
                booked: 'New', processing: 'Processing', collected: 'Collected',
                at_hub: 'At Hub', delivered: 'Delivered',
              };
              const curStep = trackSteps.indexOf(b.status);
              const isDone  = curStep === trackSteps.length - 1;

              const receipt = receiptData[b.id];
              const jubahDoc = receipt ? buildJubahReceiptRows({
                reference:    receipt.reference,
                fullName:     receipt.full_name,
                icNumber:     receipt.ic_number ?? '',
                hpNumber:     receipt.hp_number,
                email:        receipt.email,
                university:   receipt.university,
                faculty:      receipt.faculty,
                matricId:     receipt.matric_id,
                remark:       receipt.remark,
                paymentMode:  receipt.payment_mode as 'pickup' | 'postage' | 'deposit',
                cost:         receipt.cost,
                balanceDue:   receipt.balance_due,
                balancePaid:  receipt.balance_paid,
                balancePaidAt: receipt.balance_paid_at,
                deliveryAddress: receipt.delivery_address,
                status:       receipt.status,
                initialPaid:   receipt.initial_paid,
                initialPaidAt: receipt.initial_paid_at,
                riderName:    receipt.rider_name,
                riderPhone:   receipt.rider_phone,
                createdAt:    receipt.created_at,
              }) : null;

              return (
              <div key={b.id} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

                {/* Customer summary */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-blue-500 font-semibold">{b.reference}</p>
                    <h3 className="text-base font-bold text-slate-800 mt-0.5">{b.full_name}</h3>
                    <p className="text-xs text-slate-400 font-normal mt-0.5">{b.remark} · {b.faculty} · UMPSA {b.campus}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLE[b.status] ?? 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </div>

                {/* Rider phone + WA (to rider) + payment mode badge */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-100 rounded-xl px-3 py-2 flex-1 min-w-0">
                    {b.rider_phone ? (
                      <>
                        <span className="text-xs font-semibold text-slate-600 truncate">{b.rider_phone}</span>
                        <a href={`https://wa.me/${toWa(b.rider_phone)}?text=${encodeURIComponent(
                          `Hello ${b.rider_name ?? 'Rider'}, saya ${b.full_name} (${b.reference}). Saya ingin bertanya mengenai tempahan jubah saya.`
                        )}`} target="_blank" rel="noopener noreferrer"
                          className="text-[#25D366] ml-auto shrink-0 active:scale-90 transition">
                          <WaIcon className="w-4 h-4" />
                        </a>
                      </>
                    ) : (
                      <span className="text-xs font-normal text-slate-400 italic">Rider not yet assigned</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-3 py-2 rounded-xl border shrink-0 ${
                    b.payment_mode === 'deposit' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                    b.payment_mode === 'postage' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                    'bg-slate-50 border-slate-100 text-slate-600'
                  }`}>
                    {b.payment_mode === 'deposit' ? 'Deposit' : b.payment_mode === 'postage' ? 'Postage' : 'Pickup'}
                  </span>
                </div>

                {/* Payment required — initial payment not yet confirmed, any mode */}
                {b.status === 'ordered' && (
                  <div className="flex flex-col gap-2 bg-amber-50 border border-amber-100 rounded-2xl p-3">
                    <p className="text-xs text-amber-700 font-semibold">
                      This booking isn't paid yet. Complete payment to continue.
                    </p>
                    {payErrors[b.id] && (
                      <p className="text-xs text-danger font-semibold">{payErrors[b.id]}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePay(b, 'initial')}
                      disabled={payingId === b.id}
                      className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] disabled:bg-slate-200 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2"
                    >
                      {payingId === b.id
                        ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Redirecting to payment…</>
                        : 'Pay Now'}
                    </button>

                    {/* Cancel — only reachable while unpaid; deliberately a
                        plain link, not a button, so it doesn't compete with
                        Pay Now as the primary action. */}
                    {cancelConfirmId === b.id ? (
                      <div className="flex flex-col gap-2 border-t border-amber-100 pt-2 mt-1">
                        <p className="text-xs text-amber-700 font-semibold text-center">
                          Cancel this booking? This can't be undone.
                        </p>
                        {cancelErrors[b.id] && (
                          <p className="text-xs text-danger font-semibold text-center">{cancelErrors[b.id]}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setCancelConfirmId(null)}
                            className="flex-1 bg-white border border-slate-200 text-slate-500 font-semibold py-2 rounded-xl text-xs transition active:scale-95"
                          >
                            No, keep it
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelBooking(b)}
                            disabled={cancellingId === b.id}
                            className="flex-1 bg-danger hover:bg-danger/90 disabled:bg-slate-200 text-white font-semibold py-2 rounded-xl text-xs transition active:scale-95"
                          >
                            {cancellingId === b.id ? '...' : 'Yes, cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setCancelConfirmId(b.id); setCancelErrors(prev => ({ ...prev, [b.id]: '' })); }}
                        className="text-xs font-semibold text-amber-700/70 hover:text-amber-700 transition active:scale-95 self-center underline underline-offset-2"
                      >
                        Cancel this booking instead
                      </button>
                    )}
                  </div>
                )}

                {/* Horizontal step bar */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    {trackSteps.map((step, i) => (
                      <React.Fragment key={step}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-semibold border-2 transition ${
                          i < curStep   ? 'bg-blue-500 border-blue-500 text-white' :
                          i === curStep ? 'bg-white border-blue-500 text-blue-500' :
                          'bg-white border-slate-200 text-slate-300'
                        }`}>
                          {i < curStep ? '✓' : i + 1}
                        </div>
                        {i < trackSteps.length - 1 && (
                          <div className={`flex-1 h-0.5 rounded-full transition ${i < curStep ? 'bg-blue-500' : 'bg-slate-200'}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    {trackSteps.map(step => (
                      <span key={step} className="text-[8px] font-normal text-slate-400 flex-1 text-center first:text-left last:text-right">
                        {STEP_LABEL[step]}
                      </span>
                    ))}
                  </div>
                  {isDone && b.status !== 'cancelled' && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
                      <p className="text-xs font-semibold text-emerald-700">✓ Delivery Complete</p>
                    </div>
                  )}
                </div>

                {/* ── DEPOSIT SECTION — hidden once cancelled, nothing left to pay ── */}
                {b.payment_mode === 'deposit' && b.status !== 'cancelled' && (
                  <div className="flex flex-col gap-2">
                    {/* Balance info card */}
                    <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 ${
                      b.balance_paid
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-amber-50 border-amber-100'
                    }`}>
                      <div>
                        <span className={`text-[8px] font-semibold block ${b.balance_paid ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {b.balance_paid ? 'Balance Paid' : 'Balance Due on Collection'}
                        </span>
                        <span className={`text-base font-black ${b.balance_paid ? 'text-emerald-700' : 'text-amber-700'}`}>
                          RM{b.balance_due.toFixed(2)}
                        </span>
                      </div>
                      {b.balance_paid && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                    </div>

                    {/* Pay balance — only once the initial payment is confirmed */}
                    {!b.balance_paid && b.status !== 'ordered' && (
                      <>
                        {payErrors[b.id] && (
                          <p className="text-xs text-danger font-semibold">{payErrors[b.id]}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePay(b, 'balance')}
                          disabled={payingId === b.id}
                          className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] disabled:bg-slate-200 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2"
                        >
                          {payingId === b.id
                            ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Redirecting to payment…</>
                            : `Pay Balance — RM${b.balance_due.toFixed(2)}`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Full receipt — gated behind the last 4 IC digits, since this
                    page is reachable via a guessable matric ID and the receipt
                    carries phone/address that matric ID alone shouldn't unlock. */}
                {jubahDoc && receipt ? (
                  <ReceiptCard doc={jubahDoc} onSavePdf={() => generateReceiptPdf(jubahDoc)} />
                ) : receiptOpenId === b.id ? (
                  <div className="flex flex-col gap-2 bg-white border border-slate-100 rounded-2xl p-3">
                    <p className="text-xs text-slate-500 font-normal">
                      Enter the last 4 digits of your IC to view your full receipt.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={icLast4}
                        onChange={e => setIcLast4(e.target.value.replace(/\D/g, ''))}
                        placeholder="1234"
                        style={{ fontSize: '16px' }}
                        className="flex-1 bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleVerifyReceipt(b)}
                        disabled={verifyingReceipt}
                        className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-slate-200 text-white font-semibold px-4 rounded-xl text-xs transition"
                      >
                        {verifyingReceipt ? '...' : 'Unlock'}
                      </button>
                    </div>
                    {receiptErrors[b.id] && (
                      <p className="text-xs text-danger font-semibold">{receiptErrors[b.id]}</p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setReceiptOpenId(b.id); setIcLast4(''); setReceiptErrors(prev => ({ ...prev, [b.id]: '' })); }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition active:scale-95 self-center"
                  >
                    View / Download Receipt
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )
      )}

    </div>
  );
};
