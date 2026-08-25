import { useState } from 'react';
import { Check, ClipboardCheck, Clock3, Copy, X } from 'lucide-react';
import { NativeSelect } from '../../../components/NativeSelect';
import { supabase } from '../../../lib/supabase';
import { UNIVERSITIES } from '../../../lib/universities';
import { copyToClipboard } from '../../../lib/clipboard';
import { WaIcon, toWa } from '../../../lib/whatsapp';

type Mode = 'deposit' | 'pickup' | 'postage';

const formatIcNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
};

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  return digits.length <= 3 ? digits : `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

export function JubahCustomQuoteSubTab({ active, showToast }: { active: boolean; showToast: (message: string) => void }) {
  const [ic, setIc] = useState('');
  const [phone, setPhone] = useState('');
  const [price, setPrice] = useState('');
  const [university, setUniversity] = useState('umpsa');
  const selectedUniversity = UNIVERSITIES.find(item => item.key === university) ?? UNIVERSITIES[0];
  const [campus, setCampus] = useState(UNIVERSITIES[0].campuses[0]);
  const [mode, setMode] = useState<Mode>('pickup');
  const [depositMethod, setDepositMethod] = useState<'pickup' | 'postage'>('pickup');
  const [zone, setZone] = useState<'SM' | 'SS'>('SM');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);
  if (!active) return null;

  const isPostage = mode === 'postage' || (mode === 'deposit' && depositMethod === 'postage');
  const createQuote = async () => {
    setCreating(true);
    setLink('');
    const { data, error } = await supabase.rpc('create_jubah_custom_quote', {
      p_ic_number: ic,
      p_customer_phone: phone,
      p_agreed_price: Number(price),
      p_university_key: university,
      p_campus: campus,
      p_payment_mode: mode,
      p_deposit_method: mode === 'deposit' ? depositMethod : null,
      p_postage_zone: isPostage ? zone : null,
    });
    setCreating(false);
    if (error || !data?.success) {
      console.error('create_jubah_custom_quote failed', error ?? data);
      const missingRpc = error?.code === 'PGRST202' || error?.message?.includes('create_jubah_custom_quote');
      showToast(data?.error ?? (missingRpc
        ? 'The custom quote database update has not been applied yet.'
        : error?.message ?? 'Could not create the quote.'));
      return;
    }
    const url = new URL(window.location.origin);
    url.searchParams.set('jubah_quote', data.token);
    setLink(url.toString());
    setShowShare(true);
    showToast('Custom quote created. It expires in 48 hours.');
  };

  const copyLink = async () => setCopied(await copyToClipboard(link));
  const whatsappMessage = `Hi, here is your Gerak Jubah quote. This secure link expires in 48 hours: ${link}`;

  return (
    <div className="space-y-4">
      <section className="border border-slate-100 rounded-3xl p-5 bg-white">
        <div className="flex items-start gap-3 mb-5">
          <ClipboardCheck className="w-5 h-5 text-slate-400 mt-0.5" />
          <div><h3 className="font-semibold text-slate-900">Custom Quote</h3><p className="text-xs font-normal text-slate-400 mt-1">Create a secure, single-use booking offer after agreeing the price with a customer.</p></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Customer IC Number</span><input value={ic} onChange={e => setIc(formatIcNumber(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="123456-78-9101" className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Customer Phone Number</span><input value={phone} onChange={e => setPhone(formatPhoneNumber(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="012-345678910" className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Agreed Total Price</span><div className="flex rounded-xl border border-slate-100 focus-within:border-slate-900"><span className="px-3 py-2.5 text-sm text-slate-400">RM</span><input value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="100.00" className="min-w-0 flex-1 py-2.5 pr-3 text-sm focus:outline-none" /></div></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">University</span><NativeSelect value={university} onChange={value => { setUniversity(value); setCampus(UNIVERSITIES.find(item => item.key === value)?.campuses[0] ?? ''); }} options={UNIVERSITIES.map(u => ({ value: u.key, label: u.shortLabel }))} /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Campus</span><NativeSelect value={campus} onChange={setCampus} options={selectedUniversity.campuses.map(value => ({ value, label: value }))} /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Service Option</span><NativeSelect value={mode} onChange={setMode} options={[{ value: 'deposit', label: 'Deposit' }, { value: 'pickup', label: 'Full Payment — Pickup Point' }, { value: 'postage', label: 'Full Payment — Pickup & Postage' }]} /></label>
          {mode === 'deposit' && <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Deposit Service</span><NativeSelect value={depositMethod} onChange={setDepositMethod} options={[{ value: 'pickup', label: 'Pickup Point' }, { value: 'postage', label: 'Pickup & Postage' }]} /></label>}
          {isPostage && <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Delivery Zone</span><NativeSelect value={zone} onChange={setZone} options={[{ value: 'SM', label: 'SM — Semenanjung Malaysia' }, { value: 'SS', label: 'SS — Sabah & Sarawak' }]} /></label>}
        </div>
        {isPostage && <p className="mt-3 text-xs font-normal text-slate-400">SM is the default. Choosing SS records the destination only; it does not add a surcharge because your agreed price already includes it.</p>}
        <button type="button" disabled={creating} onClick={createQuote} className="mt-5 w-full rounded-xl bg-primary text-white py-3 text-sm font-semibold active:scale-[0.99] transition-transform disabled:opacity-50">{creating ? 'Creating…' : 'Send Quote'}</button>
      </section>
      {link && <section className="border border-slate-100 rounded-3xl p-5 bg-white"><div className="flex items-center gap-2 mb-3"><Clock3 className="w-4 h-4 text-slate-400"/><p className="text-sm font-semibold text-slate-800">Secure quote link</p></div><p className="text-xs font-normal text-slate-400 break-all">{link}</p><button type="button" onClick={copyLink} className="mt-4 w-full border border-slate-100 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 active:bg-slate-50">{copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}{copied ? 'Copied' : 'Copy Link'}</button></section>}
      {showShare && link && <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-5" onPointerDown={e => { if (e.currentTarget === e.target) setShowShare(false); }}><section className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between mb-5"><h3 className="font-semibold text-slate-900">Send Quote</h3><button type="button" onClick={() => setShowShare(false)} className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center active:scale-[0.99]"><X className="w-5 h-5 text-slate-500"/></button></div><div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-xs font-normal text-slate-400">Phone Number</p><p className="mt-1 text-sm font-semibold text-slate-900">{phone}</p></div><a href={`https://wa.me/${toWa(phone)}?text=${encodeURIComponent(whatsappMessage)}`} target="_blank" rel="noopener noreferrer" aria-label="Send quote through WhatsApp" className="text-[#25D366] active:scale-90 transition-transform"><WaIcon className="w-7 h-7"/></a></div><div className="pt-4"><p className="text-xs font-normal text-slate-400">Quote Link</p><div className="mt-2 flex items-center gap-3"><p className="min-w-0 flex-1 truncate text-xs font-normal text-slate-600">{link}</p><button type="button" onClick={copyLink} aria-label="Copy quote link" className="w-10 h-10 shrink-0 rounded-xl border border-slate-100 flex items-center justify-center active:bg-slate-50">{copied ? <Check className="w-4 h-4 text-emerald-500"/> : <Copy className="w-4 h-4 text-slate-500"/>}</button></div></div></section></div>}
    </div>
  );
}
