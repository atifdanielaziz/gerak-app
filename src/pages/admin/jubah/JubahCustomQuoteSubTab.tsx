import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, Clock3, Copy } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { copyToClipboard } from '../../../lib/clipboard';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import { useApp } from '../../../context/AppContext';
import { UNIVERSITY_MAP, universityKeyFromCampus } from '../../../lib/universities';

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

// Deliberately minimal — the customer still supplies university, campus,
// service option and documents themselves via the link. This exists
// purely so pricing stays a WhatsApp negotiation rather than a published
// rate card: the runner agrees a total with the customer first, then
// issues a link that fixes that price plus their phone number (saved with
// the quote and used to pre-fill the customer's HP Number field once they
// verify by IC — still editable on their side, just a convenience default).
export function JubahCustomQuoteSubTab({
  active,
  showToast,
  lockedUniversityKey,
}: {
  active: boolean;
  showToast: (message: string) => void;
  lockedUniversityKey?: string;
}) {
  const { riderCampus, showConfirmModal } = useApp();
  const [scopedCampus, setScopedCampus] = useState<string | null>(null);
  const [ic, setIc] = useState('');
  const [price, setPrice] = useState('');
  // Saved with the quote (create_jubah_custom_quote) so the customer's HP
  // Number pre-fills once they verify by IC — also lets this same value
  // drive the "Send via WhatsApp" button below right after generating.
  const [phone, setPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!lockedUniversityKey) {
      setScopedCampus(riderCampus || null);
      return;
    }
    setScopedCampus(null);
    void (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || cancelled) return;
      const { data } = await supabase
        .from('jubah_rider_assignments')
        .select('campus')
        .eq('rider_id', authUser.id)
        .eq('is_active', true);
      if (cancelled) return;
      const assignedCampus = ((data as Array<{ campus: string }> | null) ?? [])
        .map(row => row.campus)
        .find(campus => universityKeyFromCampus(campus) === lockedUniversityKey);
      setScopedCampus(assignedCampus ?? UNIVERSITY_MAP[lockedUniversityKey]?.campuses[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, [lockedUniversityKey, riderCampus]);

  if (!active) return null;

  const createQuote = async (confirmOverride = false) => {
    // A fast double-tap fires this before React re-renders the disabled
    // button — without this guard that created two quotes for the same IC,
    // burning rate-limit quota and orphaning whichever one wasn't newest
    // (the by-IC lookup only ever resolves the latest match).
    if (creating) return;
    setCreating(true);
    setLink('');
    if (!price.trim() || isNaN(Number(price)) || Number(price) <= 0) {
      showToast('Enter a valid agreed price.');
      setCreating(false);
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      showToast('Enter a valid customer phone number.');
      setCreating(false);
      return;
    }
    const { data, error } = await supabase.rpc('create_jubah_custom_quote', {
      p_ic_number: ic,
      p_agreed_price: Number(price),
      p_customer_phone: phone,
      p_campus: scopedCampus,
      p_confirm_override: confirmOverride,
    });
    setCreating(false);
    if (error || !data?.success) {
      console.error('create_jubah_custom_quote failed', error ?? data);
      const missingRpc = error?.code === 'PGRST202' || error?.message?.includes('create_jubah_custom_quote');
      if (data?.error_code === 'existing_quote') {
        showConfirmModal({
          title: 'Customer already quoted',
          message: `${data.error} Create another quote for this customer anyway?`,
          confirmLabel: 'Create Anyway',
          cancelLabel: 'Cancel',
          onConfirm: () => { void createQuote(true); },
        });
        return;
      }
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
  const whatsappMessage = `Your Gerak Jubah quote is ready. Valid for 48 hours:\n${link}`;

  return (
    <div className="space-y-4">
      <section className="border border-slate-100 rounded-3xl p-5 bg-white">
        <div className="flex items-start gap-3 mb-5">
          <ClipboardCheck className="w-5 h-5 text-slate-400 mt-0.5" />
          <div><h3 className="font-semibold text-slate-900">Custom Quote</h3><p className="text-xs font-normal text-slate-400 mt-1">Agree a total price with the customer over WhatsApp, then generate a link. Their phone number pre-fills on the form; they fill in the rest (university, campus, service option, documents) themselves.</p></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Customer IC Number</span><input value={ic} onChange={e => setIc(formatIcNumber(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="123456-78-9101" className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" /></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Agreed Total Price</span><div className="flex rounded-xl border border-slate-100 focus-within:border-slate-900"><span className="px-3 py-2.5 text-sm text-slate-400">RM</span><input value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="100.00" className="min-w-0 flex-1 py-2.5 pr-3 text-sm focus:outline-none" /></div></label>
          <label className="space-y-2"><span className="text-sm font-normal text-slate-500">Customer Phone Number</span><input value={phone} onChange={e => setPhone(formatPhoneNumber(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="012-3456789" className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-slate-900" /></label>
        </div>
        <button type="button" disabled={creating} onClick={() => createQuote()} className="mt-5 w-full rounded-xl bg-primary text-white py-3 text-sm font-semibold active:scale-[0.99] transition-transform disabled:opacity-50">{creating ? 'Creating…' : 'Generate Quote Link'}</button>
      </section>
      {link && <section className="border border-slate-100 rounded-3xl p-5 bg-white">
        <div className="flex items-center gap-2 mb-3"><Clock3 className="w-4 h-4 text-slate-400"/><p className="text-sm font-semibold text-slate-800">Secure quote link</p></div>
        <p className="text-xs font-normal text-slate-400 mb-1">Send this to the customer on WhatsApp. Valid for 48 hours; the price only unlocks once they enter the matching IC number.</p>
        <p className="text-xs font-normal text-slate-400 break-all">{link}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={copyLink} className="flex-1 border border-slate-100 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 active:bg-slate-50">{copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}{copied ? 'Copied' : 'Copy Link'}</button>
          {phone.replace(/\D/g, '').length >= 9 && (
            <a href={`https://wa.me/${toWa(phone)}?text=${encodeURIComponent(whatsappMessage)}`}
              target="_blank" rel="noopener noreferrer"
              className="shrink-0 rounded-xl bg-[#25D366] text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold active:scale-[0.98] transition-transform">
              <WaIcon className="w-4 h-4" />
              Send via WhatsApp
            </a>
          )}
        </div>
      </section>}
    </div>
  );
}
