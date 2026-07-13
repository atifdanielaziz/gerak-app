import React, { useState } from 'react';
import { X } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';

interface FareModalProps {
  customerName: string;
  customerContact: string;
  date: string;
  time: string;
  submitting: boolean;
  onConfirm: (fare: number) => void;
  onDismiss?: () => void;
}

export const FareModal: React.FC<FareModalProps> = ({ customerName, customerContact, date, time, submitting, onConfirm, onDismiss }) => {
  const [value, setValue] = useState('');
  const fare = parseFloat(value);
  const valid = !isNaN(fare) && fare > 0;
  const firstName = customerName.split(' ')[0] || customerName;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      onClick={onDismiss}
    >
      <div className="w-full max-w-[320px] bg-white rounded-3xl p-6 flex flex-col gap-4 relative" onClick={e => e.stopPropagation()}>
        {onDismiss && (
          <button
            onPointerDown={e => { e.preventDefault(); onDismiss(); }}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-lg font-bold text-slate-900 m-0">Set Trip Fare</h2>
          <p className="text-xs font-normal text-slate-500 leading-relaxed">
            Agree on a fare with {customerName} before starting the trip.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-2xl px-4 py-3 focus-within:border-slate-900 transition">
          <span className="text-sm font-semibold text-slate-400">RM</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="30"
            style={{ fontSize: '16px' }}
            className="flex-1 min-w-0 text-sm font-semibold text-slate-800 focus:outline-none placeholder:text-slate-300 placeholder:font-normal"
          />
        </div>

        <a
          href={`https://wa.me/${toWa(customerContact)}?text=${encodeURIComponent(`Hi ${customerName}, I'm your Gerak driver for the ride on ${date} at ${time}. What fare works for you?`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 text-[#25D366] font-semibold text-xs py-2.5 rounded-xl active:scale-[0.98] transition"
        >
          <WaIcon className="w-4 h-4" /> Message {firstName} to agree on price
        </a>

        <button
          onClick={() => valid && onConfirm(fare)}
          disabled={!valid || submitting}
          className="w-full py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm tracking-wide active:scale-95 transition shadow-md shadow-primary/25 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2"
        >
          {submitting
            ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : 'Confirm Fare'}
        </button>
      </div>
    </div>
  );
};
