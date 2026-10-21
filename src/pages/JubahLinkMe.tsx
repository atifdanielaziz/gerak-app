import { useRef, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Eye, FileUp, Lock, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getJubahCustomerDocUrl, openInNewTab, uploadJubahLinkMeSlip } from '../lib/jubahDocs';

// gerakmy.com/jubah/linkme?ref=JUB-26-UMPSA-XXXX — the link staff send from
// the job card's "Minta slip LinkMe" WhatsApp button. Shows only the LinkMe
// slip upload (no receipt, other documents or status), behind the usual
// last-4-IC check. Rendered on its own like /jnt, outside App.

type Status = { full_name: string; faculty: string | null; campus: string | null; uploaded: boolean; uploaded_at: string | null };

export default function JubahLinkMe() {
  const [reference, setReference] = useState(() => (new URLSearchParams(window.location.search).get('ref') ?? '').trim().toUpperCase());
  const [last4, setLast4] = useState('');
  const [verifiedLast4, setVerifiedLast4] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const unlock = async () => {
    setError(null);
    if (!/^JUB-/i.test(reference)) { setError('Enter your order number (e.g. JUB-26-UMPSA-XXXX).'); return; }
    if (!/^\d{4}$/.test(last4)) { setError('Enter the last 4 digits of your IC.'); return; }
    setBusy(true);
    const { data, error: e } = await supabase.rpc('get_jubah_linkme_status', { p_reference: reference, p_ic_last4: last4 });
    setBusy(false);
    if (e || !data?.success) { setError(data?.error ?? e?.message ?? 'Something went wrong. Please try again.'); return; }
    setVerifiedLast4(last4);
    setStatus(data as Status);
  };

  const upload = async (file: File) => {
    setError(null); setDone(false); setBusy(true);
    const res = await uploadJubahLinkMeSlip(reference, verifiedLast4, file);
    setBusy(false);
    if (!res.success) { setError(res.error); return; }
    setStatus(s => (s ? { ...s, uploaded: true, uploaded_at: new Date().toISOString() } : s));
    setDone(true);
  };

  const view = async (download: boolean) => {
    const { url, error: e } = await getJubahCustomerDocUrl(reference, verifiedLast4, 'linkme', download);
    if (url) openInNewTab(url); else setError(e ?? 'Could not open your slip.');
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-50 text-slate-800">
      <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <span className="text-2xl font-extrabold text-red-500 tracking-tight">gerak</span>
          <h1 className="text-lg font-bold m-0">Upload LinkMe Slip</h1>
          <p className="text-sm text-slate-500 m-0">
            Your <b>Official Profile Verification Slip</b> from LinkMe is needed at the convocation souvenir counter when we collect your robe.
          </p>
        </header>

        {!status ? (
          <section className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
            <label className="text-xs font-semibold text-slate-400" htmlFor="lm-ref">Order number</label>
            <input id="lm-ref" value={reference} onChange={e => setReference(e.target.value.trim().toUpperCase())} placeholder="JUB-26-UMPSA-XXXX"
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono font-semibold focus:outline-none focus:border-slate-900" />
            <label className="text-xs font-semibold text-slate-400" htmlFor="lm-ic">Last 4 digits of your IC</label>
            <input id="lm-ic" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="e.g. 5678"
              onKeyDown={e => { if (e.key === 'Enter') void unlock(); }}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono font-semibold focus:outline-none focus:border-slate-900" />
            {error && <p className="text-xs font-semibold text-red-500 m-0">{error}</p>}
            <button type="button" onClick={() => void unlock()} disabled={busy}
              className="flex items-center justify-center gap-2 bg-red-500 text-white font-semibold text-sm py-3 rounded-xl active:scale-[0.98] transition disabled:opacity-50">
              <Lock className="w-4 h-4" /> {busy ? 'Checking…' : 'Unlock'}
            </button>
          </section>
        ) : (
          <>
            <section className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-0.5">
              <span className="font-mono text-xs font-semibold text-blue-600">{reference}</span>
              <span className="text-base font-bold">{status.full_name}</span>
              <span className="text-xs text-slate-400">{[status.faculty, status.campus].filter(Boolean).join(' · ')}</span>
            </section>

            <section className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold flex-1">LinkMe Slip</span>
                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${status.uploaded ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                  {status.uploaded ? 'Uploaded' : 'Not uploaded yet'}
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0">PDF, JPG or PNG, up to 5 MB.</p>

              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); if (fileRef.current) fileRef.current.value = ''; }} />

              {status.uploaded && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  <span className="text-xs font-semibold flex-1 min-w-0 truncate">
                    Uploaded {status.uploaded_at ? new Date(status.uploaded_at).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                  </span>
                  <button type="button" onClick={() => void view(false)} aria-label="View slip" className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 border border-blue-100 text-blue-600"><Eye className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => void view(true)} aria-label="Download slip" className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-white"><Download className="w-3.5 h-3.5" /></button>
                </div>
              )}

              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm font-semibold text-slate-600 hover:border-red-300 hover:bg-red-50/40 transition disabled:opacity-50">
                {busy ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-red-500 animate-spin" />
                  : status.uploaded ? <RotateCcw className="w-4 h-4" /> : <FileUp className="w-4 h-4" />}
                {busy ? 'Uploading…' : status.uploaded ? 'Replace with another file' : 'Choose file & upload'}
              </button>

              {done && <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 m-0"><CheckCircle2 className="w-4 h-4" /> LinkMe slip received. Thank you! / Slip LinkMe diterima. Terima kasih!</p>}
              {error && <p className="text-xs font-semibold text-red-500 m-0">{error}</p>}
            </section>

            <a href="https://link-me.com.my/alumni_umpsa.php" target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1 hover:text-red-500">
              Not registered on LinkMe yet? Sign up here <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
