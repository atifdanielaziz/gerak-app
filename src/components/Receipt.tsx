import React, { useState } from 'react';
import { FileDown, Copy, Check } from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';
import type { ReceiptDoc, ReceiptMeta, ReceiptRow } from '../lib/receiptRows';

const valueClass = (r: ReceiptRow) =>
  r.emphasis === 'highlight' ? 'text-blue-600 font-bold' :
  r.emphasis === 'total'     ? 'text-sm font-bold text-slate-800' :
                                'text-slate-700';

export const ReceiptHeader: React.FC<{ meta: ReceiptMeta }> = ({ meta }) => (
  <div className="flex items-center justify-between">
    <span className={`text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${meta.statusClassName}`}>
      {meta.statusLabel}
    </span>
    <div className="text-right">
      {meta.createdAt && (
        <p className="text-xs text-slate-400 font-semibold">
          {new Date(meta.createdAt).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      )}
      <p className="text-[10px] text-slate-300 font-mono mt-0.5">{meta.bookingRef}</p>
    </div>
  </div>
);

export const ReceiptCard: React.FC<{
  doc: ReceiptDoc;
  onSavePdf?: () => void;
  children?: React.ReactNode;
}> = ({ doc, onSavePdf, children }) => {
  // Colons line up in one column, based on the longest label in this receipt.
  const maxLabelLen = Math.max(...doc.rows.map(r => r.label.length));
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyRow = (i: number, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(prev => (prev === i ? null : prev)), 1500);
  };

  return (
  <div className="bg-white border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1.5 leading-relaxed">
    {doc.rows.map((r, i) => (
      <React.Fragment key={i}>
        {r.dividerBefore && <div className="border-t border-dashed border-slate-200 my-1" />}
        <div className="flex items-start gap-1.5">
          <span className="text-slate-400 shrink-0" style={{ width: `${maxLabelLen}ch` }}>{r.label}</span>
          <span className="text-slate-400 shrink-0">:</span>
          {/* min-w-0 lets this shrink to its share of the row; overflow-x-auto
              contains long unbroken values (e.g. filenames) inside their own
              scrollable strip instead of spilling past the card — normal
              multi-word text still wraps as before and never needs to scroll. */}
          <div className="min-w-0 overflow-x-auto no-scrollbar">
            <span className={`${valueClass(r)} whitespace-nowrap`}>{r.value}</span>
          </div>
          {r.whatsapp && <WaBtn phone={r.whatsapp.phone} message={r.whatsapp.message} />}
          {r.copyable && (
            <button
              type="button"
              onClick={() => copyRow(i, r.value)}
              className="text-blue-500 active:scale-90 transition shrink-0"
            >
              {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </React.Fragment>
    ))}
    {children}
    {onSavePdf && (
      <button
        type="button"
        onClick={onSavePdf}
        className="w-full mt-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 bg-slate-50 font-semibold text-xs py-2 rounded-xl transition active:scale-[0.98] active:bg-slate-100"
      >
        <FileDown className="w-3.5 h-3.5" />
        Save as PDF
      </button>
    )}
  </div>
  );
};

export const ReceiptSheet: React.FC<{
  doc: ReceiptDoc;
  onClose: () => void;
  onSavePdf?: () => void;
  children?: React.ReactNode;
}> = ({ doc, onClose, onSavePdf, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center"
    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
    onClick={onClose}
  >
    <div
      className="w-full max-w-[480px] max-h-[calc(100dvh-3rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl shadow-2xl animate-slide-up"
      onClick={e => e.stopPropagation()}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      <div className="px-5 pt-2 pb-4 flex flex-col gap-4">
        <ReceiptHeader meta={doc} />
        <ReceiptCard doc={doc} onSavePdf={onSavePdf}>{children}</ReceiptCard>
        <button onClick={onClose}
          className="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-extrabold text-xs active:scale-95 transition">
          Close
        </button>
      </div>
    </div>
  </div>
);
