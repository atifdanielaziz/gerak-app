import { useState } from 'react';
import { Check, ClipboardCheck, Clock3, Copy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { copyToClipboard } from '../../../lib/clipboard';

const formatIcNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
};

// Deliberately minimal — the customer supplies everything else (phone,
// university, campus, service option, documents) themselves via the link.
// This exists purely so pricing stays a WhatsApp negotiation rather than a
// published rate card: the runner agrees a total with the customer first,
// then issues a link that only fixes that one number.
export function JubahCustomQuoteSubTab({
  active,
  showToast,
}: {
  active: boolean;
  showToast: (message: string) => void;
}) {
  const [ic, setIc] = useState('');
  const [price, setPrice] = useState('');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  if (!active) return null;

  const createQuote = async () => {
    setCreating(true);
    setLink('');
    if (!price.trim() || isNaN(Number(price)) || Number(price) <= 0) {
      showToast('Enter a valid agreed price.');
      setCreating(false);
      return;
    }
    const { data, error } = await supabase.rpc('create_jubah_custom_quote', {
      p_ic_number: ic,
      p_agreed_price: Number(price),
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
    url.searchParams.set('q', data.token);
    setLink(url.toString());
    showToast('Custom quote created. It expires in 48 hours.');
    setIc('');
    setPrice('');
  };

  const copyLink = async () => setCopied(await copyToClipboard(link));

  return (
    <div className="space-y-4">
      <section className="border border-slate-100 rounded-3xl p-5 bg-white">
        <div className="flex items-start gap-3 mb-5">
          <ClipboardCheck className="w-5 h-5 text-slate-400 mt-0.5" />
          <div><h3 className="font-semibold text-slate-900">Custom Quote</h3><p className="text-xs font-normal text-slate-400 mt-1">Agree a total price with the customer over WhatsApp, then generate a link. They fill in the rest (phone, university, campus, service option, documents) themselves.</p></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Customer IC Number</span><input value={ic} onChange={e => setIc(formatIcNumber(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="123456-78-9101" className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Agreed Total Price</span><div className="flex rounded-xl border border-slate-100 focus-within:border-slate-900"><span className="px-3 py-2.5 text-sm text-slate-400">RM</span><input value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="100.00" className="min-w-0 flex-1 py-2.5 pr-3 text-sm focus:outline-none" /></div></label>
        </div>
        <button type="button" disabled={creating} onClick={createQuote} className="mt-5 w-full rounded-xl bg-primary text-white py-3 text-sm font-semibold active:scale-[0.99] transition-transform disabled:opacity-50">{creating ? 'Creating…' : 'Generate Quote Link'}</button>
      </section>
      {link && <section className="border border-slate-100 rounded-3xl p-5 bg-white"><div className="flex items-center gap-2 mb-3"><Clock3 className="w-4 h-4 text-slate-400"/><p className="text-sm font-semibold text-slate-800">Secure quote link</p></div><p className="text-xs font-normal text-slate-400 mb-1">Send this to the customer on WhatsApp. Valid for 48 hours; the price only unlocks once they enter the matching IC number.</p><p className="text-xs font-normal text-slate-400 break-all">{link}</p><button type="button" onClick={copyLink} className="mt-4 w-full border border-slate-100 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 active:bg-slate-50">{copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}{copied ? 'Copied' : 'Copy Link'}</button></section>}
    </div>
  );
}
