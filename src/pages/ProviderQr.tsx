import { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, QrCode } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

type PaymentDetails = {
  bank_name: string;
  account_number: string;
  account_holder: string;
  qr_path: string | null;
};

export function ProviderQr() {
  const { user, activeRole } = useApp();
  const [details, setDetails] = useState<PaymentDetails>({ bank_name: '', account_number: '', account_holder: '', qr_path: null });
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);
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

  // Re-sign a fresh 1-hour signed URL for the QR image — reused on initial
  // load and from the <img onError> handler below, since the signed URL
  // silently expires after an hour and would otherwise leave the QR broken
  // until a full page reload.
  const signQrUrl = async (path: string) => {
    const { data: signed } = await supabase.storage.from('provider-payment-qr').createSignedUrl(path, 3600);
    setQrUrl(signed?.signedUrl || '');
  };

  useEffect(() => {
    if (!isProvider) return;
    void (async () => {
      const { data, error } = await supabase.rpc('get_my_provider_payment_details');
      if (!error && data?.success) {
        const next = {
          bank_name: data.bank_name || '', account_number: data.account_number || '',
          account_holder: data.account_holder || '', qr_path: data.qr_path || null,
        };
        setDetails(next);
        if (next.qr_path) {
          qrRetriedRef.current = false;
          await signQrUrl(next.qr_path);
        }
      }
      setLoading(false);
    })();
  }, [isProvider]);

  const handleQrError = () => {
    if (qrRetriedRef.current || !details.qr_path) return;
    qrRetriedRef.current = true;
    void signQrUrl(details.qr_path);
  };

  return (
    <main className="scrollable-page flex-1 px-5 pt-5 bg-white">
      <header className="mb-5">
        <div className="flex items-center gap-2"><QrCode className="w-5 h-5 text-slate-400" /><h1 className="font-semibold text-slate-900">Payment QR</h1></div>
        <p className="text-sm font-normal text-slate-400 mt-1">{roles.join(' · ')}</p>
      </header>

      <section className="w-full max-w-sm mx-auto aspect-square border border-slate-100 rounded-3xl overflow-hidden bg-white flex items-center justify-center mb-5">
        {loading ? (
          <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : qrUrl ? (
          <img src={qrUrl} alt="Provider payment QR" className="w-full h-full object-contain p-4" onError={handleQrError} />
        ) : (
          <div className="text-center px-8"><QrCode className="w-16 h-16 text-slate-200 mx-auto mb-3" /><p className="text-sm font-normal text-slate-400">Set up your payment QR in Profile → My Finance.</p></div>
        )}
      </section>

      <section className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-4"><Landmark className="w-5 h-5 text-blue-600" /><h2 className="font-semibold text-blue-800">Bank Details</h2></div>
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-5 space-y-3">
          {[
            ['Bank Type', details.bank_name],
            ['Acc. No', details.account_number],
            ['Acc. Holder', details.account_holder],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[5.5rem_auto_minmax(0,1fr)] gap-x-2 items-start text-sm font-semibold text-slate-900">
              <span className="text-slate-400">{label}</span>
              <span aria-hidden="true">:</span>
              <span className="min-w-0 break-words">{value || 'Not set'}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
