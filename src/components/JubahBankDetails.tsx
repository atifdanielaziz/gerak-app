import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';

export interface JubahBankInfo { name: string; account: string; holder: string }

// The shared Jubah payee account, shown on the booking form and the
// deposit-balance step. Label above value (not side by side): a long
// account holder name squeezed next to its label wrapped into a cramped
// two-column mess on phones. Account number gets a copy button since
// that's the field customers otherwise retype by hand.
export function JubahBankDetails({ bank, tone = 'slate' }: { bank: JubahBankInfo; tone?: 'slate' | 'blue' }) {
  const [copied, setCopied] = useState(false);
  const label = tone === 'blue' ? 'text-blue-400' : 'text-slate-400';
  const value = tone === 'blue' ? 'text-blue-900' : 'text-slate-800';

  const copyAccount = async () => {
    if (!(await copyToClipboard(bank.account.replace(/\s+/g, '')))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col divide-y divide-slate-100">
      <div className="py-2 first:pt-0">
        <span className={`block text-[11px] font-semibold ${label}`}>Bank</span>
        <span className={`block text-sm font-bold ${value}`}>{bank.name}</span>
      </div>
      <div className="py-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span className={`block text-[11px] font-semibold ${label}`}>Account No.</span>
          <span className={`block text-sm font-bold font-mono tracking-wide ${value}`}>{bank.account}</span>
        </div>
        <button type="button" onClick={() => { void copyAccount(); }} aria-label="Copy account number"
          className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold active:scale-95 transition ${copied ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-500'}`}>
          {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
      <div className="py-2 last:pb-0">
        <span className={`block text-[11px] font-semibold ${label}`}>Account Holder</span>
        <span className={`block text-sm font-bold leading-snug ${value}`}>{bank.holder}</span>
      </div>
    </div>
  );
}
