import { useState } from 'react';
import { Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { NativeSelect } from './NativeSelect';

// Track My Order (after the last-4-IC unlock): a Pickup booking can switch
// to Postage by giving a delivery address. No extra charge and the rider
// stays the same (owner's call). Server-side checks — IC digits, Robe
// Status 'ordered'/'paid' only, state list, Sabah & Sarawak switch — live
// in customer_change_jubah_to_postage
// (migration 20261018100000_jubah_customer_change_to_postage.sql).

const MALAYSIAN_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'Wilayah Persekutuan Kuala Lumpur', 'Wilayah Persekutuan Labuan', 'Wilayah Persekutuan Putrajaya',
];

export function JubahChangeToPostage({ reference, icLast4, onChanged }: {
  reference: string; icLast4: string; onChanged: (deliveryAddress: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postcode, setPostcode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!line1.trim() || !city.trim() || !state) { setError('Please fill in your address, city and state.'); return; }
    if (!/^\d{5}$/.test(postcode)) { setError('Postcode must be 5 digits.'); return; }
    setSaving(true);
    const { data, error: rpcErr } = await supabase.rpc('customer_change_jubah_to_postage', {
      p_reference: reference, p_ic_last4: icLast4,
      p_line1: line1.trim(), p_line2: line2.trim(), p_postcode: postcode, p_city: city.trim(), p_state: state,
    });
    setSaving(false);
    if (rpcErr || !data?.success) { setError(data?.error ?? rpcErr?.message ?? 'Could not save. Please try again.'); return; }
    onChanged(data.delivery_address as string);
  };

  const input = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3 active:bg-slate-50 transition active:scale-[0.99] text-left">
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
          <Truck className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700 m-0">Change to Postage</p>
          <p className="text-xs text-slate-400 m-0">Can't collect at the pickup point? Get your robe posted to you instead.</p>
        </div>
      </button>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-700 m-0">Change to Postage — delivery address</p>
      </div>
      <p className="text-xs text-slate-400 m-0">No extra charge. Your rider stays the same. The robe will be posted by J&amp;T to this address.</p>
      <input id={`pg-line1-${reference}`} className={input} placeholder="Address line 1 (house no., street)" value={line1} maxLength={150} onChange={e => setLine1(e.target.value)} />
      <input id={`pg-line2-${reference}`} className={input} placeholder="Address line 2 (optional)" value={line2} maxLength={150} onChange={e => setLine2(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input id={`pg-postcode-${reference}`} className={`${input} font-mono`} placeholder="Postcode" inputMode="numeric" maxLength={5}
          value={postcode} onChange={e => setPostcode(e.target.value.replace(/\D/g, ''))} />
        <input id={`pg-city-${reference}`} className={input} placeholder="City" value={city} maxLength={60} onChange={e => setCity(e.target.value)} />
      </div>
      <NativeSelect value={state} onChange={setState} placeholder="State" options={MALAYSIAN_STATES.map(s => ({ value: s, label: s }))} />
      {error && <p className="text-xs font-semibold text-danger m-0">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(null); }} disabled={saving}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Change to Postage'}</button>
      </div>
    </div>
  );
}
