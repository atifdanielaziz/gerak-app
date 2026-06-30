import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { PackageSearch, Search, GraduationCap } from 'lucide-react';

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
                <div className="bg-slate-50 rounded-xl p-3 text-[10px]">
                  <span className="text-slate-400 font-bold uppercase tracking-wider block text-[8px]">Rider</span>
                  <span className="font-bold text-slate-700">{b.rider_name ?? 'Not yet assigned'}</span>
                </div>
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
