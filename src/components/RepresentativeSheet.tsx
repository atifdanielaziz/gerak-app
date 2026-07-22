import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';

interface Props {
  name:       string;
  dropPoint:  string;
  method:     string;
  icNumber:   string | null;
  phone:      string | null;
  waMessage:  string;
  onClose:    () => void;
}

const MaskedIc: React.FC<{ ic: string | null }> = ({ ic }) => {
  if (!ic) return <span className="text-sm font-semibold text-slate-800">—</span>;
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return <span className="text-sm font-semibold text-slate-800 font-mono">{ic}</span>;
  return (
    <span className="text-sm font-semibold font-mono">
      <span className="text-slate-800">{digits.slice(0, 6)}</span>
      <span className="text-slate-800">-</span>
      <span className="text-red-500">XX</span>
      <span className="text-slate-800">-</span>
      <span className="text-red-500">XXXX</span>
    </span>
  );
};

export const RepresentativeSheet: React.FC<Props> = ({
  name, dropPoint, method, icNumber, phone, waMessage, onClose,
}) => {
  const [copiedField, setCopiedField] = useState<'name' | 'phone' | null>(null);

  const copyValue = (value: string, field: 'name' | 'phone') => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(prev => (prev === field ? null : prev)), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" style={{ backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar">

        {/* Drag pill */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
          <div>
            <p className="text-xs font-normal text-slate-400">Representative</p>
            <h3 className="text-base font-semibold text-slate-800 mt-0.5">{name}</h3>
          </div>
          <button onPointerDown={e => { e.preventDefault(); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 flex flex-col gap-2"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">

            {/* Representative Name */}
            <div className="flex items-end justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-normal text-slate-400">Representative Name</span>
                <span className="text-sm font-semibold text-slate-800">{name}</span>
              </div>
              <button onPointerDown={e => { e.preventDefault(); copyValue(name, 'name'); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 active:scale-90 transition-transform shrink-0">
                {copiedField === 'name' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Drop Point */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-normal text-slate-400">Drop Point</span>
              <span className="text-sm font-semibold text-slate-800">{dropPoint}</span>
            </div>

            {/* Method */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-normal text-slate-400">Method</span>
              <span className="text-sm font-semibold text-slate-800">{method}</span>
            </div>

            {/* I/C Number — masked only; full number is via WhatsApp */}
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-normal text-slate-400">I/C Number</span>
              <MaskedIc ic={icNumber} />
            </div>

            {/* H/P */}
            <div className="flex items-end justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-normal text-slate-400">H/P</span>
                <span className="text-sm font-semibold text-slate-800">{phone || '—'}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {phone && (
                  <a
                    href={`https://wa.me/${toWa(phone)}?text=${encodeURIComponent(waMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="w-8 h-8 flex items-center justify-center text-[#25D366] active:scale-90 transition-transform"
                  >
                    <WaIcon className="w-5 h-5" />
                  </a>
                )}
                {phone && (
                  <button onPointerDown={e => { e.preventDefault(); copyValue(phone, 'phone'); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 active:scale-90 transition-transform">
                    {copiedField === 'phone' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 font-normal text-center px-2">
            Need the full I/C? Message the rider on WhatsApp.
          </p>
        </div>
      </div>
    </>
  );
};
