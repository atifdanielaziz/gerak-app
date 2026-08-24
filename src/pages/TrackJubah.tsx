import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { PackageSearch, Search, GraduationCap } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';
import { ReceiptCard } from '../components/Receipt';
import { buildJubahReceiptRows } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { getPendingJubahBooking, clearPendingJubahBooking } from '../lib/pendingJubahBooking';
import { JUBAH_STEP_LABEL, getJubahProgress } from '../lib/jubahStatus';
import { JubahBalancePayment } from '../components/JubahBalancePayment';
import { JubahStepper } from '../components/JubahStepper';

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
  rider_id: string | null;
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
  ordered:    'Payment Pending',
  paid:       'Paid',
  processing: 'Processing Documents',
  collected:  'Robe Collected',
  at_hub:     'Delivered',
  picked_up:  'Picked Up',
  on_the_way: 'On The Way',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_STYLE: Record<string, string> = {
  ordered:    'bg-slate-50 border-slate-200 text-slate-500',
  paid:       'bg-emerald-50 border-emerald-100 text-emerald-700',
  processing: 'bg-violet-50 border-violet-100 text-violet-700',
  collected:  'bg-blue-50 border-blue-100 text-blue-700',
  at_hub:     'bg-emerald-50 border-emerald-100 text-emerald-700',
  picked_up:  'bg-blue-50 border-blue-100 text-blue-700',
  on_the_way: 'bg-violet-50 border-violet-100 text-violet-700',
  delivered:  'bg-emerald-50 border-emerald-100 text-emerald-700',
  cancelled:  'bg-red-50 border-red-100 text-red-600',
};

export const TrackJubah: React.FC = () => {
  const { setCurrentPage, setLeaveGuard } = useApp();

  // A guest reaching this page directly (a shared tracking link, no prior
  // in-app navigation) has an empty pageHistory — back was previously
  // either fully swallowed (web) or exited the app immediately (native
  // Android), since AppContext had nowhere queued to go back to. Same
  // leaveGuard mechanism every other overlay/sub-page in this app already
  // uses, just pointed at the dashboard instead of closing a sub-view.
  useEffect(() => {
    setLeaveGuard(() => () => setCurrentPage('dashboard'));
    return () => setLeaveGuard(null);
  }, [setLeaveGuard, setCurrentPage]);

  const [reference, setReference] = useState('');
  const [icNumber, setIcNumber]   = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched]   = useState(false);
  const [results, setResults]     = useState<JubahBookingResult[]>([]);
  const [error, setError]         = useState('');

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

  // Shared Jubah bank account — one account for every rider/customer, set by
  // superadmin (JubahPriceSubTab.tsx). Public read, same as jubah_active.
  const [bankDetails, setBankDetails] = useState<{ name: string; account: string; holder: string } | null>(null);
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['jubah_bank_name', 'jubah_bank_account_number', 'jubah_bank_account_holder'])
      .then(({ data }) => {
        const name    = data?.find(r => r.key === 'jubah_bank_name')?.value;
        const account = data?.find(r => r.key === 'jubah_bank_account_number')?.value;
        const holder  = data?.find(r => r.key === 'jubah_bank_account_holder')?.value;
        if (name && account && holder) setBankDetails({ name, account, holder });
      });
  }, []);

  const runSearch = async () => {
    setError('');
    setResults([]);
    const refValue = reference.trim();
    const icDigits = icNumber.replace(/\D/g, '');
    // Reference AND IC are both required together — track_jubah_booking no
    // longer accepts either alone (or matric/phone at all). A reference or
    // IC by itself is guessable/enumerable/shareable-via-link; requiring
    // both closes that off, matching get_jubah_receipt's existing pattern.
    if (!refValue || !icNumber.trim()) {
      setError('Please enter both your reference number and IC number.');
      return;
    }
    if (icDigits.length !== 12) {
      setError('Please enter a valid 12-digit IC number (e.g. 980123-45-6789).');
      return;
    }
    setSearching(true);
    setSearched(false);
    const { data, error: rpcError } = await supabase.rpc('track_jubah_booking', {
      p_reference:  refValue,
      p_ic_number:  icNumber.trim(),
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

  // Supports a bookmarked/shared "?reference=..." deep link, or returning
  // from the unfinished-booking nudge (same pending-booking marker) —
  // pre-fills the reference so the customer doesn't need to retype it.
  // Deliberately does NOT auto-search: track_jubah_booking now requires
  // reference + IC together (see 20260823140000_track_jubah_booking_
  // require_ic.sql), and a shared/bookmarked link only ever carries the
  // reference — auto-running with reference alone would just always fail
  // validation, and a reference-only link is exactly the single-factor
  // exposure that migration closed, so it must not be reintroduced here.
  useEffect(() => {
    const refParam = new URLSearchParams(window.location.search).get('reference');
    const fallbackRef = refParam ? null : getPendingJubahBooking()?.reference ?? null;
    const target = refParam || fallbackRef;
    if (target) setReference(target.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">IC Number</label>
          <input
            type="text"
            inputMode="numeric"
            value={icNumber}
            onChange={e => setIcNumber(e.target.value)}
            placeholder="e.g. 980123-45-6789"
            style={{ fontSize: '16px' }}
            className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
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
            <p className="text-xs text-slate-400 font-normal">Double-check your reference number or IC number and try again.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {results.map(b => {
              const { steps: trackSteps, curStep, isDone } = getJubahProgress(b.status, b.payment_mode);

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
                    b.payment_mode === 'deposit'
                      ? (b.balance_paid ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-amber-50 border-amber-100 text-amber-700')
                      : b.payment_mode === 'postage' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                    'bg-slate-50 border-slate-100 text-slate-600'
                  }`}>
                    {b.payment_mode === 'deposit'
                      ? (b.balance_paid ? 'Full Payment (DP)' : 'Deposit')
                      : b.payment_mode === 'postage' ? 'Postage' : 'Pickup'}
                  </span>
                </div>

                {/* Awaiting confirmation — proof uploaded at booking time, just
                    waiting on an admin to review it. Still cancellable from
                    here while it's in this state. */}
                {b.status === 'ordered' && (
                  <div className="flex flex-col gap-2 bg-amber-50 border border-amber-100 rounded-2xl p-3">
                    <p className="text-xs text-amber-700 font-semibold">
                      Awaiting confirmation — an admin will review your payment proof shortly.
                    </p>

                    {/* Cancel — only reachable while unconfirmed; deliberately
                        a plain link, not a prominent button, since there's no
                        other primary action on this card anymore. */}
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
                  <JubahStepper steps={trackSteps} curStep={curStep} labels={JUBAH_STEP_LABEL} color="blue" labelWeight="normal" />
                  {isDone && b.status !== 'cancelled' && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
                      <p className="text-xs font-semibold text-emerald-700">✓ Delivery Complete</p>
                    </div>
                  )}
                </div>

                {/* ── DEPOSIT SECTION — hidden once cancelled (nothing left to pay) or
                     before the deposit itself is confirmed (status='ordered', covered
                     by the "Awaiting confirmation" banner above instead): showing
                     "Balance Due on Collection RM45" here implied that was all that
                     was left, when the configured deposit hadn't been confirmed either yet. ── */}
                {b.payment_mode === 'deposit' && b.status !== 'cancelled' && b.status !== 'ordered' && (
                  <JubahBalancePayment
                    reference={b.reference}
                    hpNumber={b.hp_number}
                    fullName={b.full_name}
                    balanceDue={b.balance_due}
                    balancePaid={b.balance_paid}
                    balanceProofUrl={b.balance_proof_url}
                    bankDetails={bankDetails}
                    onSubmitted={proof => setResults(prev => prev.map(r => r.id === b.id ? { ...r, balance_proof_url: proof } : r))}
                  />
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
                        className="flex-1 bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
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
