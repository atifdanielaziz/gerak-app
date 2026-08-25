import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote, Car, GraduationCap, Landmark, QrCode,
  Truck, Upload, WalletCards,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

type PaymentDetails = {
  bank_name: string;
  account_number: string;
  account_holder: string;
  qr_path: string | null;
};

const emptyDetails: PaymentDetails = { bank_name: '', account_number: '', account_holder: '', qr_path: null };

export const ProviderFinance: React.FC = () => {
  const { user, activeRole } = useApp();
  const [saved, setSaved] = useState<PaymentDetails>(emptyDetails);
  const [draft, setDraft] = useState<PaymentDetails>(emptyDetails);
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankLocked, setBankLocked] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [earnings, setEarnings] = useState({ car: 0, jubah: 0, rental: 0 });
  const qrRetriedRef = useRef(false);

  const isProvider = user.role === 'driver' || user.role === 'rider' || activeRole === 'driver' || activeRole === 'rider' || user.canDrive || user.canRent || user.canTransport;
  const roles = useMemo(() => {
    const result: string[] = [];
    if (user.role === 'driver' || activeRole === 'driver' || user.canDrive) result.push('Driver');
    if (user.role === 'rider' || activeRole === 'rider') result.push('Rider');
    if (user.canRent) result.push('Car Rental');
    if (user.canTransport) result.push('Transporter');
    return result.length ? result : ['Service Provider'];
  }, [activeRole, user]);
  const dirty = draft.bank_name !== saved.bank_name || draft.account_number !== saved.account_number || draft.account_holder !== saved.account_holder;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  };

  // Re-sign a fresh 1-hour signed URL for the QR image — reused on initial
  // load, after a new QR upload, and from the <img onError> handler below,
  // since the signed URL silently expires after an hour and would otherwise
  // leave the QR broken until a full page reload.
  const signQrUrl = async (path: string) => {
    const { data: signed } = await supabase.storage.from('provider-payment-qr').createSignedUrl(path, 3600);
    setQrUrl(signed?.signedUrl || '');
  };

  const handleQrError = () => {
    if (qrRetriedRef.current || !saved.qr_path) return;
    qrRetriedRef.current = true;
    void signQrUrl(saved.qr_path);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_provider_payment_details');
    if (!error && data?.success) {
      const next: PaymentDetails = {
        bank_name: data.bank_name || '', account_number: data.account_number || '',
        account_holder: data.account_holder || '', qr_path: data.qr_path || null,
      };
      setSaved(next);
      setDraft(next);
      setBankLocked(true);
      if (next.qr_path) {
        qrRetriedRef.current = false;
        await signQrUrl(next.qr_path);
      }
    }

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      const [carResult, rentalResult, jubahResult] = await Promise.all([
        supabase.from('ride_orders').select('fare,night_charge').eq('driver_id', uid).eq('status', 'completed'),
        supabase.from('rental_bookings').select('total_price').eq('owner_id', uid).eq('status', 'completed'),
        supabase.rpc('get_rider_jubah_earnings'),
      ]);
      setEarnings({
        car: (carResult.data || []).reduce((sum, row) => sum + Number(row.fare || 0) + Number(row.night_charge || 0), 0),
        rental: (rentalResult.data || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0),
        jubah: Array.isArray(jubahResult.data) ? jubahResult.data.reduce((sum, row) => sum + Number(row.rider_commission_amount || 0), 0) : 0,
      });
    }
    setLoading(false);
  };

  useEffect(() => { if (isProvider) void load(); }, [isProvider]);

  const uploadQr = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showNotice('Use a JPG, PNG, or WebP image up to 5 MB.');
      return;
    }
    setUploading(true);
    const { data: auth } = await supabase.auth.getUser();
    const path = `${auth.user?.id}/qr`;
    const { error: uploadError } = await supabase.storage.from('provider-payment-qr').upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      showNotice(uploadError.message);
      setUploading(false);
      return;
    }
    const { data, error } = await supabase.rpc('set_my_provider_qr_path', { p_qr_path: path });
    if (error || !data?.success) showNotice(error?.message || data?.error || 'QR could not be saved.');
    else {
      qrRetriedRef.current = false;
      await signQrUrl(path);
      setSaved(prev => ({ ...prev, qr_path: path }));
      setDraft(prev => ({ ...prev, qr_path: path }));
      showNotice('Payment QR saved.');
    }
    setUploading(false);
  };

  const saveBank = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('set_my_provider_payment_details', {
      p_bank_name: draft.bank_name,
      p_account_number: draft.account_number,
      p_account_holder: draft.account_holder,
      p_qr_path: draft.qr_path,
    });
    if (error || !data?.success) showNotice(error?.message || data?.error || 'Bank details could not be saved.');
    else {
      setSaved({ ...draft });
      setBankLocked(true);
      showNotice('Bank details saved.');
    }
    setSaving(false);
  };

  if (!isProvider) return (
    <main className="scrollable-page flex-1 px-5 pt-6">
      <div className="border border-slate-100 rounded-3xl p-6 text-center"><QrCode className="w-8 h-8 mx-auto text-slate-300 mb-3" /><p className="font-semibold text-slate-800">Provider finance is available to service providers.</p></div>
    </main>
  );

  const total = earnings.car + earnings.jubah + earnings.rental;
  return (
    <main className="scrollable-page flex-1 px-5 pt-5 bg-white">
      {notice && <div className="fixed z-[90] top-20 left-1/2 -translate-x-1/2 rounded-2xl bg-slate-900 text-white px-5 py-3 text-sm font-semibold shadow-lg whitespace-nowrap">{notice}</div>}
      <section className="mb-5">
        <div className="flex items-center gap-2"><QrCode className="w-5 h-5 text-slate-400" /><h1 className="font-semibold text-slate-900">Payment QR</h1></div>
        <p className="text-sm font-normal text-slate-400 mt-1">{roles.join(' · ')}</p>
      </section>

      <section className="border border-slate-100 rounded-3xl p-5 mb-5">
        <div className="aspect-square w-full max-w-sm mx-auto rounded-2xl border border-slate-100 bg-white flex items-center justify-center overflow-hidden">
          {loading ? <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : qrUrl ? <img src={qrUrl} alt="Provider payment QR" className="w-full h-full object-contain p-4" onError={handleQrError} /> : <div className="text-center px-6"><QrCode className="w-16 h-16 text-slate-200 mx-auto mb-3" /><p className="text-sm text-slate-400">Upload your DuitNow or bank payment QR.</p></div>}
        </div>
        <input id="provider-payment-qr-upload" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadQr} disabled={uploading} />
        <label htmlFor="provider-payment-qr-upload" aria-disabled={uploading} className="mt-4 w-full flex items-center justify-center gap-2 bg-white border border-slate-100 rounded-2xl py-3.5 font-semibold text-slate-800 active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu cursor-pointer aria-disabled:opacity-50">
          <Upload className="w-4 h-4" />{uploading ? 'Uploading…' : qrUrl ? 'Replace QR' : 'Upload QR'}
        </label>
      </section>

      <section className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5 mb-5">
        <div className="flex items-center gap-2 mb-1"><Landmark className="w-5 h-5 text-slate-500" /><h2 className="font-semibold text-slate-900">Payment Bank Details</h2></div>
        <p className="text-sm text-slate-400 mb-5">Customers can use these details to pay you.</p>
        <div className="space-y-4">
          {([
            ['Bank Name', 'bank_name'], ['Account Number', 'account_number'], ['Account Holder', 'account_holder'],
          ] as const).map(([label, key]) => <label key={key} className="block"><span className="block text-sm font-normal text-slate-400 mb-1.5">{label}</span><input value={draft[key]} readOnly={bankLocked} onClick={() => { if (bankLocked) setBankLocked(false); }} onChange={(event) => setDraft(prev => ({ ...prev, [key]: event.target.value }))} className={`w-full bg-slate-50 border border-slate-200 focus:border-primary outline-none rounded-xl px-4 py-3 text-sm font-semibold transition ${bankLocked ? 'text-slate-400 cursor-pointer' : 'text-slate-700'}`} /></label>)}
        </div>
        <div className="flex justify-end mt-5">
          <button type="button" onPointerDown={(event) => { event.preventDefault(); if (dirty && !saving) void saveBank(); }} disabled={!dirty || saving} className={`shrink-0 px-4 py-2.5 rounded-xl text-xs border font-semibold transition-transform transform-gpu active:scale-[0.99] ${dirty || saving ? 'bg-primary border-primary text-white shadow-lg shadow-primary/30' : 'bg-white border-slate-300 text-slate-400 shadow-none'}`}>
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </section>

      <section className="border border-slate-100 rounded-3xl p-5">
        <div className="flex items-center gap-2"><WalletCards className="w-5 h-5 text-slate-400" /><h2 className="font-semibold text-slate-900">Earnings</h2></div>
        <p className="text-3xl font-black text-slate-900 mt-4">RM{total.toFixed(2)}</p>
        <p className="text-sm text-slate-400">Recorded completed services</p>
        <div className="mt-5 divide-y divide-slate-100">
          {[
            { label: 'Gerak Car', value: earnings.car, icon: Car },
            { label: 'Jubah Delivery', value: earnings.jubah, icon: GraduationCap },
            { label: 'Car Rental', value: earnings.rental, icon: Banknote },
            { label: 'Transporter', value: 0, icon: Truck },
          ].filter(row => row.value > 0 || roles.some(role => row.label.includes(role.split(' ')[0]))).map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center justify-between py-3"><span className="flex items-center gap-2 text-sm text-slate-500"><Icon className="w-4 h-4" />{label}</span><strong className="text-sm font-semibold text-slate-800">RM{value.toFixed(2)}</strong></div>)}
        </div>
      </section>
    </main>
  );
};
