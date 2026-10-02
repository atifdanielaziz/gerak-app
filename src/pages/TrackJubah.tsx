import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { PackageSearch, Search, GraduationCap, Eye, Download } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';
import { ReceiptCard } from '../components/Receipt';
import { buildJubahReceiptRows } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { getPendingJubahBooking, clearPendingJubahBooking } from '../lib/pendingJubahBooking';
import { JUBAH_STEP_LABEL, getJubahProgress } from '../lib/jubahStatus';
import { JubahBalancePayment } from '../components/JubahBalancePayment';
import { JubahStepper } from '../components/JubahStepper';
import { JubahDocReplaceButton, DOC_REPLACE_SUCCESS_MSG } from '../components/JubahDocReplaceButton';
import { customerReplaceJubahDocument, regenerateJubahCombinedPdf, getJubahCustomerDocUrl, openInNewTab, type JubahDocField } from '../lib/jubahDocs';

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
  oscar_path: string | null;
  skpg_path: string | null;
  konvo_path: string | null;
  ic_path: string | null;
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

  // Full receipt state — id of the booking whose IC-digit prompt is open,
  // the digits being entered, and (once verified) the fetched receipt data
  // keyed by booking id so each result's receipt unlocks independently.
  const [receiptOpenId, setReceiptOpenId]   = useState<string | null>(null);
  const [icLast4, setIcLast4]               = useState('');
  const [verifyingReceipt, setVerifyingReceipt] = useState(false);
  const [receiptErrors, setReceiptErrors]   = useState<Record<string, string>>({});
  const [receiptData, setReceiptData]       = useState<Record<string, JubahReceiptData>>({});
  // get_jubah_receipt's gate is "reference + last-4 IC" — the same thing
  // customer_replace_jubah_document re-checks server-side, so the digits
  // need to survive past verification (icLast4 itself is cleared right
  // after) for the Replace buttons below to be able to call it.
  const [verifiedIcLast4, setVerifiedIcLast4] = useState<Record<string, string>>({});
  const [replaceMsg, setReplaceMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

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
    const icValue = icNumber.trim();
    const icDigits = icNumber.replace(/\D/g, '');
    // Either field alone is enough — track_jubah_booking matches on
    // whichever of reference/IC is supplied (and both, if both are given).
    if (!refValue && !icValue) {
      setError('Please enter your reference number or IC number.');
      return;
    }
    if (icValue && icDigits.length !== 12) {
      setError('Please enter a valid 12-digit IC number (e.g. 980123-45-6789).');
      return;
    }
    setSearching(true);
    setSearched(false);
    const { data, error: rpcError } = await supabase.rpc('track_jubah_booking', {
      p_reference:  refValue || null,
      p_ic_number:  icValue || null,
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
  // Left as a pre-fill rather than auto-search so the page doesn't fire an
  // RPC call before the user has actually landed on it.
  useEffect(() => {
    const refParam = new URLSearchParams(window.location.search).get('reference');
    const fallbackRef = refParam ? null : getPendingJubahBooking()?.reference ?? null;
    const target = refParam || fallbackRef;
    if (target) setReference(target.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setVerifiedIcLast4(prev => ({ ...prev, [b.id]: icLast4 }));
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
          <h2 className="text-xl font-semibold m-0 text-slate-800">Track My Order</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">
            Jubah Delivery Status
          </p>
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-400">Reference Number <span className="font-normal text-slate-300">(or IC below)</span></label>
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
          <label className="text-xs font-semibold text-slate-400">IC Number <span className="font-normal text-slate-300">(or reference above)</span></label>
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
                    <h3 className="text-base font-semibold text-slate-800 mt-0.5">{b.full_name}</h3>
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
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                    <p className="text-xs text-amber-700 font-semibold">
                      Awaiting confirmation — an admin will review your payment proof shortly.
                    </p>
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
                  <>
                    <ReceiptCard doc={jubahDoc} onSavePdf={() => generateReceiptPdf(jubahDoc)} />

                    {/* Your Documents — view/download always available (same
                        as the rider/superadmin views), Replace only while
                        unlocked (Robe Status 'ordered'/'paid' — enforced
                        server-side too, this is just so the lock is visible
                        rather than a silent no-op). Combined PDF is excluded
                        — it's generated from these four, not uploaded directly. */}
                    {(() => {
                      const unlocked = receipt.status === 'ordered' || receipt.status === 'paid';
                      return (
                        <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
                          <p className="text-xs font-semibold text-slate-500">
                            {unlocked ? 'Your Documents — uploaded the wrong file? Replace it below.' : 'Your Documents'}
                          </p>
                          {([
                            { label: 'OSCAR',      url: receipt.oscar_path, field: 'oscar' as JubahDocField },
                            { label: 'SKPG',       url: receipt.skpg_path,  field: 'skpg' as JubahDocField },
                            { label: 'Konvo Slip', url: receipt.konvo_path, field: 'konvo' as JubahDocField },
                            { label: 'IC Copy',    url: receipt.ic_path,    field: 'ic' as JubahDocField },
                          ]).map(({ label, url, field }) => (
                            <div key={label} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-slate-700 truncate">{label}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${url ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                  {url ? 'Uploaded' : 'Missing'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={!url}
                                  aria-label={`View ${label}`}
                                  onClick={async () => {
                                    const { url: signed, error } = await getJubahCustomerDocUrl(b.reference, verifiedIcLast4[b.id] ?? '', field);
                                    if (signed) openInNewTab(signed);
                                    else setReplaceMsg(prev => ({ ...prev, [b.id]: { ok: false, text: error ? `Couldn't open ${label}: ${error}` : `Couldn't open ${label}.` } }));
                                  }}
                                  className={`w-8 h-8 flex items-center justify-center rounded-lg border transition shrink-0 ${url ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100 active:scale-95' : 'bg-white border-slate-100 text-slate-300 cursor-not-allowed'}`}>
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!url}
                                  aria-label={`Download ${label}`}
                                  onClick={async () => {
                                    const { url: signed, error } = await getJubahCustomerDocUrl(b.reference, verifiedIcLast4[b.id] ?? '', field, true);
                                    if (signed) openInNewTab(signed);
                                    else setReplaceMsg(prev => ({ ...prev, [b.id]: { ok: false, text: error ? `Couldn't download ${label}: ${error}` : `Couldn't download ${label}.` } }));
                                  }}
                                  className={`w-8 h-8 flex items-center justify-center rounded-lg border transition shrink-0 ${url ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700 active:scale-95' : 'bg-white border-slate-100 text-slate-300 cursor-not-allowed'}`}>
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                {unlocked && (
                                  <JubahDocReplaceButton
                                    reference={b.reference}
                                    field={field}
                                    onReplace={(f, p) => customerReplaceJubahDocument(b.reference, verifiedIcLast4[b.id] ?? '', f, p)}
                                    onSuccess={p => setReceiptData(prev => ({ ...prev, [b.id]: { ...prev[b.id], [`${field}_path`]: p } }))}
                                    onRegenerateCombined={() => regenerateJubahCombinedPdf({ reference: b.reference, icLast4: verifiedIcLast4[b.id] ?? '' })}
                                    showToast={msg => setReplaceMsg(prev => ({ ...prev, [b.id]: { ok: msg === DOC_REPLACE_SUCCESS_MSG, text: msg } }))}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                          {replaceMsg[b.id] && (
                            <p className={`text-xs font-semibold ${replaceMsg[b.id].ok ? 'text-emerald-600' : 'text-danger'}`}>
                              {replaceMsg[b.id].text}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </>
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
