import { useCallback, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { TrendingUp, GraduationCap, Landmark } from 'lucide-react';
import { NativeSelect } from '../../../components/NativeSelect';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { JubahQrButton } from '../../../components/JubahQrButton';
import { UNIVERSITIES } from '../../../lib/universities';

// Abbreviated labels here (not the full names JubahLanding shows) since this
// sits compactly in a card header — keeps the Jubah Pricing Matrix's
// university switcher wired to the exact same list customers pick from.
const JUBAH_PRICING_UNIVERSITIES = UNIVERSITIES.map(u => ({ key: u.key, label: u.shortLabel }));

type JubahPrice = { remark: string; payment_mode: string; price: number; university: string };

interface JubahPriceSubTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  showToast: (msg: string) => void;
}

// Jubah pricing matrix + rider commission rates — split out of AdminHome.tsx.
// Both were previously fetched as a side effect of the shared loadJubahData()
// call (riders + bookings + prices, all in one function, firing whenever the
// Jubah tab became active at all). Here they load independently, on-demand,
// only when this sub-tab is actually viewed — same data, same RPCs, just no
// longer tangled with riders/bookings loading that this sub-tab never uses.
export function JubahPriceSubTab({ active, isSuperAdmin, showToast }: JubahPriceSubTabProps) {
  const [priceDrafts,       setPriceDrafts]       = useState<Record<string, string>>({});
  // Last-saved values — compared against priceDrafts to know which fields
  // are actually dirty, so the one global Save button below the matrix
  // only sends what changed and can disable itself when nothing has.
  const [priceOriginal,     setPriceOriginal]     = useState<Record<string, string>>({});
  const [pricingUniversity, setPricingUniversity] = useState('umpsa');
  const [savingAllPrices,   setSavingAllPrices]   = useState(false);

  // Two separate rates — pickup vs postage — since a postage order's price
  // includes real shipping cost paid out to Pos Malaysia, not money the
  // rider earned handling it. One flat rate across both doesn't reflect that.
  const [commissionRates,  setCommissionRates]  = useState<{ pickup: string; postage: string } | null>(null);
  const [commissionDrafts, setCommissionDrafts] = useState({ pickup: '', postage: '' });
  const [savingCommission, setSavingCommission] = useState<'pickup' | 'postage' | null>(null);
  const [commissionSaved,  setCommissionSaved]  = useState({ pickup: false, postage: false });

  const loadJubahPrices = useCallback(async () => {
    const { data: pricesData } = await supabase.rpc('get_jubah_pricing');
    if (pricesData) {
      const drafts: Record<string, string> = {};
      (pricesData as JubahPrice[]).forEach(p => {
        const key = `${p.remark}_${p.payment_mode}_${p.university}`;
        drafts[key] = String(p.price);
      });
      setPriceDrafts(drafts);
      setPriceOriginal(drafts);
    }
  }, []);

  useLoadOnActive(active, loadJubahPrices);

  const pricesDirty = Object.keys(priceDrafts).some(k => priceDrafts[k] !== priceOriginal[k]);

  // One global Save instead of a Save button per field — individual saves
  // were easy to miss (a value could look "changed" but never actually get
  // sent). Only fields that actually changed get written; each is still its
  // own set_jubah_price call (no bulk RPC exists), just fired together
  // under one button instead of one at a time.
  const handleSaveAllPrices = async () => {
    const dirtyKeys = Object.keys(priceDrafts).filter(k => priceDrafts[k] !== priceOriginal[k]);
    if (dirtyKeys.length === 0) return;
    setSavingAllPrices(true);
    const results = await Promise.all(dirtyKeys.map(async key => {
      const [remark, paymentMode, university] = key.split('_');
      const price = parseFloat(priceDrafts[key] ?? '0');
      if (isNaN(price) || price < 0) return { key, ok: false };
      const { error } = await supabase.rpc('set_jubah_price', {
        p_remark: remark, p_payment_mode: paymentMode, p_price: price, p_university: university,
      });
      return { key, ok: !error };
    }));
    setSavingAllPrices(false);
    const failedCount = results.filter(r => !r.ok).length;
    if (failedCount > 0) {
      showToast(`${failedCount} price${failedCount > 1 ? 's' : ''} failed to save — please try again.`);
    } else {
      showToast('Pricing matrix saved ✓');
    }
    loadJubahPrices();
  };

  // Rider commission — superadmin-only to change (enforced server-side in
  // set_jubah_rider_commission_amount, not just hidden here). Flat RM per
  // completed order, not a percentage — a postage order's price includes
  // real shipping cost passed through to Pos Malaysia, which isn't money
  // the rider actually earned handling it, so a flat amount is simpler and
  // more predictable than a percentage of a value that varies for reasons
  // unrelated to the rider's own work.
  const loadCommissionRates = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['jubah_rider_commission_amount_pickup', 'jubah_rider_commission_amount_postage']);
    const pickup  = data?.find(r => r.key === 'jubah_rider_commission_amount_pickup')?.value  ?? '0';
    const postage = data?.find(r => r.key === 'jubah_rider_commission_amount_postage')?.value ?? '0';
    setCommissionRates({ pickup, postage });
    setCommissionDrafts({ pickup, postage });
    // Freshly loaded from the DB — these ARE the current saved values, so
    // they start locked/gray, same as right after an explicit Save.
    setCommissionSaved({ pickup: true, postage: true });
  }, []);

  useLoadOnActive(active, loadCommissionRates);

  const handleSaveCommission = async (deliveryType: 'pickup' | 'postage') => {
    const amount = parseFloat(commissionDrafts[deliveryType]);
    if (isNaN(amount) || amount < 0) { showToast('Enter a valid RM amount.'); return; }
    setSavingCommission(deliveryType);
    const { data, error } = await supabase.rpc('set_jubah_rider_commission_amount', { p_amount: amount, p_delivery_type: deliveryType });
    setSavingCommission(null);
    if (error || !data?.success) { showToast(data?.error ?? 'Failed to save commission amount.'); return; }
    showToast(`${deliveryType === 'pickup' ? 'Pickup Only' : 'Postage'} commission updated.`);
    setCommissionRates(prev => prev ? { ...prev, [deliveryType]: commissionDrafts[deliveryType] } : prev);
    setCommissionSaved(prev => ({ ...prev, [deliveryType]: true }));
  };

  // Payment Bank Details — one shared account every customer pays into,
  // superadmin-only to change (enforced server-side in set_jubah_bank_details,
  // not just hidden here). A mistaken or malicious edit here silently
  // redirects real customer payments, so this is deliberately stricter than
  // the admin-or-superadmin default most app_settings rows allow.
  const [bankDraft, setBankDraft] = useState({ name: '', account: '', holder: '' });
  const [bankSaved, setBankSaved] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  const loadBankDetails = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['jubah_bank_name', 'jubah_bank_account_number', 'jubah_bank_account_holder']);
    const name    = data?.find(r => r.key === 'jubah_bank_name')?.value ?? '';
    const account = data?.find(r => r.key === 'jubah_bank_account_number')?.value ?? '';
    const holder  = data?.find(r => r.key === 'jubah_bank_account_holder')?.value ?? '';
    setBankDraft({ name, account, holder });
    setBankSaved(true);
  }, []);

  useLoadOnActive(active, loadBankDetails);

  const handleSaveBank = async () => {
    if (!bankDraft.name.trim() || !bankDraft.account.trim() || !bankDraft.holder.trim()) {
      showToast('All three bank detail fields are required.');
      return;
    }
    setSavingBank(true);
    const { data, error } = await supabase.rpc('set_jubah_bank_details', {
      p_bank_name:      bankDraft.name.trim(),
      p_account_number: bankDraft.account.trim(),
      p_account_holder: bankDraft.holder.trim(),
    });
    setSavingBank(false);
    if (error || !data?.success) { showToast(data?.error ?? 'Failed to save bank details.'); return; }
    showToast('Payment bank details updated ✓');
    setBankSaved(true);
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Payment Bank Details — the one shared account every customer pays
          into. Regular admin sees it read-only for transparency, same
          pattern as Rider Commission below. */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Landmark className="w-4 h-4" /> Payment Bank Details
          </h3>
          {isSuperAdmin && <JubahQrButton canManage showToast={showToast} />}
        </div>
        <p className="text-xs text-slate-400 font-semibold -mt-1.5">
          Customers transfer here for every Jubah booking.
        </p>
        {isSuperAdmin ? (
          <div className="flex flex-col gap-2.5">
            {([
              { key: 'name' as const,    label: 'Bank Name' },
              { key: 'account' as const, label: 'Account Number' },
              { key: 'holder' as const,  label: 'Account Holder' },
            ]).map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-xs font-normal text-slate-400">{label}</label>
                <input
                  type="text"
                  value={bankDraft[key]}
                  onChange={e => setBankDraft(prev => ({ ...prev, [key]: e.target.value }))}
                  readOnly={bankSaved}
                  onClick={() => { if (bankSaved) setBankSaved(false); }}
                  style={{ fontSize: '13px' }}
                  className={`bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold focus:outline-none focus:border-primary transition ${bankSaved ? 'text-slate-400 cursor-pointer' : 'text-slate-700'}`}
                />
              </div>
            ))}
            <button
              onClick={handleSaveBank}
              disabled={savingBank || bankSaved}
              className="self-end bg-primary text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50"
            >
              {savingBank ? '…' : 'Save'}
            </button>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">{bankDraft.name || 'Not set yet'}</span>
            <span className="text-xs font-semibold text-slate-600 font-mono">{bankDraft.account}</span>
            <span className="text-xs font-semibold text-slate-600">{bankDraft.holder}</span>
            <span className="text-xs font-normal text-slate-400 mt-1">superadmin only to change</span>
          </div>
        )}
      </div>

      {/* Rider commission — regular admin sees it read-only for
          transparency. Applies only to bookings that complete from now on —
          changing it never rewrites past earnings (see migration_jubah_
          commission_by_delivery_type.sql). */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> Rider Commission
        </h3>
        <p className="text-xs text-slate-400 font-semibold -mt-1.5">
          Flat RM amount a rider earns once an order is delivered — set separately for pickup vs postage, since postage price includes real shipping cost. Only applies going forward — changing it never rewrites past earnings.
        </p>
        {(['pickup', 'postage'] as const).map(type => (
          <div key={type} className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">{type === 'pickup' ? 'Pickup Only' : 'Postage'}</label>
            {isSuperAdmin ? (
              <div className="flex gap-2">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 gap-1 flex-1 focus-within:border-primary transition">
                  <span className="text-xs font-normal text-slate-400 shrink-0">RM</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={commissionDrafts[type]}
                    onChange={e => setCommissionDrafts(prev => ({ ...prev, [type]: e.target.value }))}
                    readOnly={commissionSaved[type]}
                    onClick={() => { if (commissionSaved[type]) setCommissionSaved(prev => ({ ...prev, [type]: false })); }}
                    style={{ fontSize: '13px' }}
                    className={`flex-1 bg-transparent font-semibold focus:outline-none w-0 ${commissionSaved[type] ? 'text-slate-400 cursor-pointer' : 'text-slate-700'}`}
                  />
                </div>
                <button
                  onClick={() => handleSaveCommission(type)}
                  disabled={savingCommission === type || commissionSaved[type]}
                  className="shrink-0 bg-primary text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50"
                >
                  {savingCommission === type ? '…' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">
                  {commissionRates === null ? 'Loading…' : `RM${commissionRates[type]} per completed order`}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-2">superadmin only to change</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4" /> Jubah Pricing Matrix
        </h3>
        <div className="w-28 shrink-0">
          <NativeSelect
            value={pricingUniversity}
            onChange={setPricingUniversity}
            options={JUBAH_PRICING_UNIVERSITIES.map(u => ({ value: u.key, label: u.label }))}
            label="Select University"
          />
        </div>
      </div>
      <p className="text-xs text-slate-400 font-semibold -mt-2">Set price per study level × service option, then tap Save Changes below.</p>

      {(['Master', 'PHD', 'Degree', 'Diploma'] as const).map(remark => (
        <div key={remark} className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-xs font-black text-slate-700">{remark}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['pickup', 'postage'] as const).map(mode => {
              const key = `${remark}_${mode}_${pricingUniversity}`;
              return (
                <div key={mode} className="flex flex-col gap-1.5">
                  <label className="text-xs font-normal text-slate-400">
                    {mode === 'pickup' ? 'Pickup Only' : 'Pickup & Postage'}
                  </label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 gap-1 focus-within:border-primary transition">
                    <span className="text-xs font-normal text-slate-400 shrink-0">RM</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceDrafts[key] ?? ''}
                      onChange={e => setPriceDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{ fontSize: '12px' }}
                      className="flex-1 bg-transparent font-semibold text-slate-700 focus:outline-none w-0"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleSaveAllPrices}
        disabled={savingAllPrices || !pricesDirty}
        className="w-full bg-primary text-white font-semibold text-sm py-3 rounded-2xl transition active:scale-95 shadow-lg shadow-primary/30 disabled:opacity-40 disabled:shadow-none"
      >
        {savingAllPrices ? 'Saving…' : pricesDirty ? 'Save Changes' : 'Saved'}
      </button>
      </div>
    </div>
  );
}
