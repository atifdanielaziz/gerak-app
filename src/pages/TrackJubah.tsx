import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { PackageSearch, Search, GraduationCap, Upload, FileText, X, Clock, CheckCircle2 } from 'lucide-react';

interface JubahBookingResult {
  id: string;
  reference: string;
  full_name: string;
  hp_number: string;
  campus: string;
  faculty: string;
  remark: string;
  rider_name: string | null;
  status: string;
  payment_mode: string;
  balance_due: number;
  balance_paid: boolean;
  balance_proof_url: string | null;
  balance_submitted_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  booked:     'Booked',
  picked_up:  'Picked Up',
  on_the_way: 'On The Way',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_STYLE: Record<string, string> = {
  booked:     'bg-amber-50 border-amber-100 text-amber-700',
  picked_up:  'bg-blue-50 border-blue-100 text-blue-700',
  on_the_way: 'bg-violet-50 border-violet-100 text-violet-700',
  delivered:  'bg-emerald-50 border-emerald-100 text-emerald-700',
  cancelled:  'bg-red-50 border-red-100 text-red-600',
};

export const TrackJubah: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [reference, setReference] = useState('');
  const [phone, setPhone]         = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched]   = useState(false);
  const [results, setResults]     = useState<JubahBookingResult[]>([]);
  const [error, setError]         = useState('');

  // Balance payment state
  const [balanceProof,   setBalanceProof]   = useState<File | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState('');
  const balanceProofRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');
    if (!reference.trim() && !phone.trim()) {
      setError('Please enter your reference number or phone number.');
      return;
    }
    setSearching(true);
    setSearched(false);
    const { data, error: rpcError } = await supabase.rpc('track_jubah_booking', {
      p_reference:  reference.trim() || null,
      p_hp_number:  phone.trim() || null,
    });
    setSearching(false);
    setSearched(true);
    if (rpcError) { setError('Something went wrong. Please try again.'); return; }
    setResults((data as JubahBookingResult[]) ?? []);
  };

  const handleBalanceSubmit = async (b: JubahBookingResult) => {
    if (!balanceProof) return;
    setSubmitting(true);
    setSubmitError('');

    // Upload proof to Supabase Storage
    let driveUrl: string | undefined;
    try {
      const ext  = balanceProof.name.split('.').pop() ?? 'pdf';
      const path = `${b.full_name.replace(/\s+/g, '_')}_balance_payment_${Date.now()}.${ext}`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from('jubah-docs')
        .upload(path, balanceProof, { contentType: balanceProof.type, upsert: false });
      if (!storageError && storageData) {
        const { data: { publicUrl } } = supabase.storage.from('jubah-docs').getPublicUrl(storageData.path);
        driveUrl = publicUrl;
      }
    } catch (err) {
      console.error('[GERAK] Balance proof upload failed:', err);
    }

    const { data } = await supabase.rpc('submit_jubah_balance', {
      p_reference:         b.reference,
      p_hp_number:         b.hp_number,
      p_balance_proof_url: driveUrl ?? 'submitted',
    });

    setSubmitting(false);
    if (data?.success) {
      setResults(prev => prev.map(r =>
        r.id === b.id ? { ...r, balance_proof_url: driveUrl ?? 'submitted' } : r
      ));
      setBalanceProof(null);
      if (balanceProofRef.current) balanceProofRef.current.value = '';
    } else {
      setSubmitError(data?.error ?? 'Submission failed. Please try again.');
    }
  };

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4">

      {/* HEADER */}
      <div className="mt-4 px-1 flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <PackageSearch className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-black m-0 text-slate-800">Track My Order</h2>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
            Jubah Delivery Status
          </p>
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reference Number</label>
          <input
            type="text"
            value={reference}
            onChange={e => setReference(e.target.value.toUpperCase())}
            placeholder="e.g. JUB-2026-XK7F"
            style={{ fontSize: '16px' }}
            className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-[9px] text-slate-300 font-extrabold uppercase">or</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 0123456789"
            style={{ fontSize: '16px' }}
            className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
          />
        </div>

        {error && (
          <p className="text-[11px] text-danger font-bold text-center bg-danger/10 border border-danger/20 rounded-xl py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={searching}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-slate-200 text-white font-extrabold py-3 rounded-2xl shadow-md transition flex items-center justify-center gap-2"
        >
          {searching
            ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <><Search className="w-4 h-4" /> Track Order</>}
        </button>
      </form>

      {/* Results */}
      {searched && (
        results.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-3 text-center">
            <GraduationCap className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-500">No booking found.</p>
            <p className="text-[10px] text-slate-400">Double-check your reference number or phone number and try again.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {results.map(b => (
              <div key={b.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] text-blue-500 font-extrabold uppercase tracking-wider">{b.reference}</p>
                    <h3 className="text-sm font-black text-slate-800 mt-0.5">{b.full_name}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{b.remark} · {b.faculty} · UMPSA {b.campus}</p>
                  </div>
                  <span className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLE[b.status] ?? 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </div>

                {/* Rider */}
                <div className="bg-slate-50 rounded-xl p-3 text-[10px]">
                  <span className="text-slate-400 font-bold uppercase tracking-wider block text-[8px]">Rider</span>
                  <span className="font-bold text-slate-700">{b.rider_name ?? 'Not yet assigned'}</span>
                </div>

                {/* ── DEPOSIT SECTION ── */}
                {b.payment_mode === 'deposit' && (
                  <div className="flex flex-col gap-2">
                    {/* Balance info card */}
                    <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 ${
                      b.balance_paid
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-amber-50 border-amber-100'
                    }`}>
                      <div>
                        <span className={`text-[8px] font-extrabold uppercase tracking-wider block ${b.balance_paid ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {b.balance_paid ? 'Balance Paid' : 'Balance Due on Collection'}
                        </span>
                        <span className={`text-base font-black ${b.balance_paid ? 'text-emerald-700' : 'text-amber-700'}`}>
                          RM{b.balance_due.toFixed(2)}
                        </span>
                      </div>
                      {b.balance_paid
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        : b.balance_proof_url
                          ? <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                          : null}
                    </div>

                    {/* Submitted — under review */}
                    {b.balance_proof_url && !b.balance_paid && (
                      <p className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        Balance payment receipt submitted — admin will confirm shortly.
                      </p>
                    )}

                    {/* Pay balance upload */}
                    {!b.balance_paid && !b.balance_proof_url && (
                      <div className="flex flex-col gap-2">
                        <p className="text-[10px] text-slate-500 font-semibold">
                          Ready to pay your balance? Upload proof of payment below.
                        </p>
                        <input
                          type="file"
                          accept=".pdf,application/pdf,image/jpeg,image/png"
                          ref={balanceProofRef}
                          onChange={e => { setBalanceProof(e.target.files?.[0] ?? null); setSubmitError(''); }}
                          className="hidden"
                        />
                        {!balanceProof ? (
                          <button
                            type="button"
                            onClick={() => balanceProofRef.current?.click()}
                            className="w-full border-2 border-dashed border-amber-200 rounded-xl py-3 flex items-center justify-center gap-2 text-amber-500 hover:border-amber-400 hover:bg-amber-50/50 transition"
                          >
                            <Upload className="w-4 h-4" />
                            <span className="text-xs font-bold">Upload Balance Payment Receipt</span>
                          </button>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                              <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-emerald-700 truncate">{balanceProof.name}</p>
                                <p className="text-[9px] text-emerald-500">{(balanceProof.size / 1024).toFixed(1)} KB</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setBalanceProof(null); if (balanceProofRef.current) balanceProofRef.current.value = ''; }}
                                className="text-slate-400 hover:text-danger transition shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleBalanceSubmit(b)}
                              disabled={submitting}
                              className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] disabled:bg-slate-200 text-white font-extrabold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2"
                            >
                              {submitting
                                ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Submitting…</>
                                : 'Submit Balance Payment'}
                            </button>
                          </div>
                        )}
                        {submitError && (
                          <p className="text-[10px] text-danger font-bold">{submitError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Back to login */}
      <button
        onClick={() => setCurrentPage('login')}
        className="text-xs text-slate-400 font-semibold hover:text-primary active:scale-95 transition text-center mt-2"
      >
        ← Back to Login
      </button>
    </div>
  );
};
