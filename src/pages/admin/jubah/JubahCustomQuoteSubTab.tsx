import { useState } from 'react';
import { ClipboardCheck, Copy, Check, Clock3 } from 'lucide-react';
import { NativeSelect } from '../../../components/NativeSelect';
import { supabase } from '../../../lib/supabase';
import { UNIVERSITIES } from '../../../lib/universities';
import { copyToClipboard } from '../../../lib/clipboard';

type Mode = 'deposit' | 'pickup' | 'postage';

export function JubahCustomQuoteSubTab({ active, showToast }: { active: boolean; showToast: (message: string) => void }) {
  const [ic, setIc] = useState('');
  const [price, setPrice] = useState('');
  const [university, setUniversity] = useState('umpsa');
  const [mode, setMode] = useState<Mode>('pickup');
  const [depositMethod, setDepositMethod] = useState<'pickup' | 'postage'>('pickup');
  const [zone, setZone] = useState<'SM' | 'SS'>('SM');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  if (!active) return null;

  const isPostage = mode === 'postage' || (mode === 'deposit' && depositMethod === 'postage');
  const createQuote = async () => {
    setCreating(true); setLink('');
    const { data, error } = await supabase.rpc('create_jubah_custom_quote', {
      p_ic_number: ic,
      p_agreed_price: Number(price),
      p_university_key: university,
      p_payment_mode: mode,
      p_deposit_method: mode === 'deposit' ? depositMethod : null,
      p_postage_zone: isPostage ? zone : null,
    });
    setCreating(false);
    if (error || !data?.success) { showToast(data?.error ?? 'Could not create the quote.'); return; }
    const url = new URL(window.location.origin);
    url.searchParams.set('jubah_quote', data.token);
    setLink(url.toString());
    showToast('Custom quote created. It expires in 48 hours.');
  };

  return (
    <div className="space-y-4">
      <section className="border border-slate-100 rounded-3xl p-5 bg-white">
        <div className="flex items-start gap-3 mb-5">
          <ClipboardCheck className="w-5 h-5 text-slate-400 mt-0.5" />
          <div><h3 className="font-semibold text-slate-900">Custom Quote</h3><p className="text-xs font-normal text-slate-400 mt-1">Create a secure, single-use booking offer after agreeing the price with a customer.</p></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Customer IC Number</span><input value={ic} onChange={e => setIc(e.target.value.replace(/[^0-9-]/g, '').slice(0, 14))} placeholder="000000-00-0000" className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Agreed Total Price</span><div className="flex rounded-xl border border-slate-100 focus-within:border-slate-900"><span className="px-3 py-2.5 text-sm text-slate-400">RM</span><input value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="100.00" className="min-w-0 flex-1 py-2.5 pr-3 text-sm focus:outline-none" /></div></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">University</span><NativeSelect value={university} onChange={setUniversity} options={UNIVERSITIES.map(u => ({ value: u.key, label: u.shortLabel }))} /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Service Option</span><NativeSelect value={mode} onChange={setMode} options={[{ value: 'deposit', label: 'Deposit' }, { value: 'pickup', label: 'Full Payment — Pickup Point' }, { value: 'postage', label: 'Full Payment — Pickup & Postage' }]} /></label>
          {mode === 'deposit' && <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Deposit Service</span><NativeSelect value={depositMethod} onChange={setDepositMethod} options={[{ value: 'pickup', label: 'Pickup Point' }, { value: 'postage', label: 'Pickup & Postage' }]} /></label>}
          {isPostage && <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Delivery Zone</span><NativeSelect value={zone} onChange={setZone} options={[{ value: 'SM', label: 'SM — Semenanjung Malaysia' }, { value: 'SS', label: 'SS — Sabah & Sarawak' }]} /></label>}
        </div>
        {isPostage && <p className="mt-3 text-xs font-normal text-slate-400">SM is the default. Choosing SS records the destination only; it does not add a surcharge because your agreed price already includes it.</p>}
        <button type="button" disabled={creating} onClick={createQuote} className="mt-5 w-full rounded-xl bg-primary text-white py-3 text-sm font-semibold active:scale-[0.99] transition-transform disabled:opacity-50">{creating ? 'Creating…' : 'Create 48-Hour Quote'}</button>
      </section>
      {link && <section className="border border-slate-100 rounded-3xl p-5 bg-white"><div className="flex items-center gap-2 mb-3"><Clock3 className="w-4 h-4 text-slate-400"/><p className="text-sm font-semibold text-slate-800">Secure quote link</p></div><p className="text-xs font-normal text-slate-400 break-all">{link}</p><button type="button" onClick={async () => { const ok = await copyToClipboard(link); setCopied(ok); }} className="mt-4 w-full border border-slate-100 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 active:bg-slate-50">{copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}{copied ? 'Copied' : 'Copy Link'}</button></section>}
    </div>
  );
}
