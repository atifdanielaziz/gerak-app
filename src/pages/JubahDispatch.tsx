import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SheetData } from 'write-excel-file/browser';
import { Check, Copy, Download, ExternalLink, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { copyToClipboard } from '../lib/clipboard';
import { parseJubahAddress } from '../lib/jubahAddress';

// Standalone page for J&T counter staff (gerakmy.com/jnt#<token>), opened
// on their own laptop with no Gerak account. The token lives in the URL
// fragment so it never reaches server logs; every read/write goes through
// get_jubah_dispatch / update_jubah_dispatch, which re-check it
// (migration 20261017100000_jubah_jnt_dispatch.sql).

type Sender = { name: string; phone: string; address: string; postcode: string; city: string; state: string };
type ApiParcel = {
  id: string; order_no: number; reference: string; name: string; phone: string; email: string | null;
  address: string | null; copied: string[]; done: boolean; tracking_no: string | null;
  sender: Sender | null; rider_name: string | null;
};
type FieldKey = 'order_no' | 'name' | 'phone' | 'email' | 'address' | 'postcode' | 'city' | 'state';
type Parcel = ApiParcel & { zone: 'SM' | 'SS'; fields: Record<FieldKey, string> };

const FIELDS: { key: FieldKey; label: string; mono?: boolean; wide?: boolean }[] = [
  { key: 'order_no', label: 'No. Order', mono: true },
  { key: 'name', label: 'Nama' },
  { key: 'phone', label: 'Telefon', mono: true },
  { key: 'email', label: 'Emel' },
  { key: 'address', label: 'Alamat', wide: true },
  { key: 'postcode', label: 'Poskod', mono: true },
  { key: 'city', label: 'Bandar' },
  { key: 'state', label: 'Negeri' },
];
const SENDER_FIELDS: { key: keyof Sender; label: string; mono?: boolean; wide?: boolean }[] = [
  { key: 'name', label: 'Nama', wide: true },
  { key: 'phone', label: 'Telefon', mono: true },
  { key: 'postcode', label: 'Poskod', mono: true },
  { key: 'address', label: 'Alamat', wide: true },
  { key: 'city', label: 'Bandar' },
  { key: 'state', label: 'Negeri' },
];
// Four rotating tints so neighbouring parcels never share a colour.
const TINTS = [
  'bg-blue-50 border-blue-200',
  'bg-orange-50 border-orange-200',
  'bg-emerald-50 border-emerald-200',
  'bg-violet-50 border-violet-200',
];
const JNT_TRACK = (no: string) => `https://www.jtexpress.my/tracking/${encodeURIComponent(no)}`;
const firstName = (n: string | null) => (n ?? '').split(' ').slice(0, 2).join(' ') || 'Runner';
const cleanPhone = (p: string) => p.replace(/\D/g, '');

function FieldBox({ label, value, mono, wide, copied, onCopy }: {
  label: string; value: string; mono?: boolean; wide?: boolean; copied: boolean; onCopy: () => void;
}) {
  return (
    <div className={`flex items-stretch rounded-xl border overflow-hidden min-w-0 transition-colors ${wide ? 'sm:col-span-2' : ''} ${
      copied ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className="flex-1 min-w-0 px-3 py-2 flex flex-col gap-0.5">
        <span className={`text-[10.5px] font-bold uppercase tracking-wider ${copied ? 'text-slate-400' : 'text-slate-400'}`}>{label}</span>
        <span className={`text-sm font-semibold break-words ${mono ? 'font-mono' : ''} ${copied ? 'text-slate-300' : 'text-slate-800'}`}>{value || '—'}</span>
      </div>
      <button type="button" disabled={!value} onClick={onCopy} aria-label={`Copy ${label}`}
        className={`w-16 shrink-0 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold border-l transition disabled:opacity-30 ${
          copied ? 'border-slate-900 text-emerald-400 hover:bg-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100'}`}>
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function JubahDispatch() {
  const token = useMemo(() => decodeURIComponent(window.location.hash.replace(/^#/, '')).trim(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [senderCopied, setSenderCopied] = useState<Record<string, boolean>>({});
  const [zone, setZone] = useState<'all' | 'SM' | 'SS'>('all');
  const [runner, setRunner] = useState('all');
  const [show, setShow] = useState<'todo' | 'all' | 'done'>('todo');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [trackDraft, setTrackDraft] = useState<Record<string, string>>({});

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(t => (t === msg ? null : t)), 1600); };

  const load = useCallback(async () => {
    if (!token) { setError('This link is incomplete. Ask Gerak for a new link.'); setLoading(false); return; }
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc('get_jubah_dispatch', { p_token: token });
    setLoading(false);
    if (rpcErr || !data?.success) { setError(data?.error ?? 'Could not load parcels. Check your connection and refresh.'); return; }
    setError(null);
    setExpiresAt(data.expires_at);
    setParcels((data.parcels as ApiParcel[]).map(p => {
      const a = parseJubahAddress(p.address);
      return {
        ...p, zone: a.zone,
        fields: {
          order_no: String(p.order_no), name: p.name ?? '', phone: cleanPhone(p.phone ?? ''), email: p.email ?? '',
          address: a.address, postcode: a.postcode, city: a.city, state: a.state,
        },
      };
    }));
  }, [token]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const save = async (id: string, patch: { p_copied?: string[]; p_done?: boolean; p_tracking_no?: string }) => {
    const { data, error: e } = await supabase.rpc('update_jubah_dispatch', { p_token: token, p_booking_id: id, ...patch });
    if (e || !data?.success) { flash(data?.error ?? 'Not saved — check your connection.'); return false; }
    return true;
  };

  const copyField = async (p: Parcel, key: FieldKey) => {
    const ok = await copyToClipboard(p.fields[key]);
    if (!ok) { flash('Copy blocked by the browser. Select the text and press Ctrl+C.'); return; }
    flash(`Copied: ${p.fields[key]}`);
    if (p.copied.includes(key)) return;
    const copied = [...p.copied, key];
    const allCopied = FIELDS.every(f => !p.fields[f.key] || copied.includes(f.key));
    // Collapse on its own once every field has been copied.
    const done = p.done || allCopied;
    setParcels(prev => prev.map(x => (x.id === p.id ? { ...x, copied, done } : x)));
    await save(p.id, { p_copied: copied, ...(done !== p.done ? { p_done: done } : {}) });
  };

  const setDone = async (p: Parcel, done: boolean) => {
    setParcels(prev => prev.map(x => (x.id === p.id ? { ...x, done } : x)));
    if (await save(p.id, { p_done: done })) flash(done ? `No. ${p.order_no} siap` : `No. ${p.order_no} dibuka semula`);
  };

  const saveTracking = async (p: Parcel) => {
    const value = (trackDraft[p.id] ?? p.tracking_no ?? '').trim();
    if (value === (p.tracking_no ?? '')) return;
    if (await save(p.id, { p_tracking_no: value })) {
      const clean = value.replace(/\s/g, '').toUpperCase() || null;
      setParcels(prev => prev.map(x => (x.id === p.id ? { ...x, tracking_no: clean } : x)));
      setTrackDraft(d => { const n = { ...d }; delete n[p.id]; return n; });
      flash(clean ? `Tracking disimpan untuk No. ${p.order_no}` : 'Tracking dipadam');
    }
  };

  const runners = useMemo(() => {
    const m = new Map<string, { name: string; sender: Sender | null }>();
    parcels.forEach(p => { const k = p.rider_name ?? '—'; if (!m.has(k)) m.set(k, { name: k, sender: p.sender }); });
    return [...m.values()];
  }, [parcels]);

  const visible = parcels.filter(p =>
    (zone === 'all' || p.zone === zone) &&
    (runner === 'all' || p.rider_name === runner) &&
    (show === 'all' || (show === 'done' ? p.done : !p.done)) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || String(p.order_no) === q.trim() || p.reference.toLowerCase().includes(q.toLowerCase())));

  const doneCount = parcels.filter(p => p.done).length;

  const exportRows = () => visible.map(p => [
    p.fields.order_no, p.fields.name, p.fields.phone, p.fields.email, p.fields.address, p.fields.postcode, p.fields.city, p.fields.state,
    p.zone === 'SS' ? 'Sabah & Sarawak' : 'Semenanjung',
    p.sender?.name ?? '', cleanPhone(p.sender?.phone ?? ''), p.sender?.address ?? '', p.sender?.postcode ?? '', p.sender?.city ?? '', p.sender?.state ?? '',
    p.tracking_no ?? '',
  ]);
  const exportHeaders = ['No. Order', 'Nama', 'Telefon', 'Emel', 'Alamat', 'Poskod', 'Bandar', 'Negeri', 'Zon',
    'Nama Pengirim', 'Telefon Pengirim', 'Alamat Pengirim', 'Poskod Pengirim', 'Bandar Pengirim', 'Negeri Pengirim', 'No. Tracking'];
  const fileBase = `gerak-jnt-${new Date().toISOString().slice(0, 10)}`;

  const download = async (format: 'csv' | 'xlsx') => {
    const rows = exportRows();
    if (rows.length === 0) { flash('Tiada parcel untuk dimuat turun.'); return; }
    try {
      if (format === 'csv') {
        // Guard against spreadsheet formula injection from customer text.
        const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
        const csv = [exportHeaders, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = `${fileBase}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } else {
        const { default: writeXlsxFile } = await import('write-excel-file/browser');
        const sheet: SheetData = [
          exportHeaders.map(value => ({ value, type: String, fontWeight: 'bold' as const, backgroundColor: '#F1F5F9' })),
          ...rows.map(r => r.map(value => ({ value, type: String }))),
        ];
        await writeXlsxFile(sheet, { columns: exportHeaders.map(h => ({ width: /Alamat/.test(h) ? 40 : Math.max(12, h.length + 4) })) })
          .toFile(`${fileBase}.xlsx`);
      }
      flash(`${format === 'csv' ? 'CSV' : 'Excel'} dimuat turun (${rows.length} parcel)`);
    } catch (e) {
      console.error('[GERAK] J&T export failed:', e);
      flash('Tak dapat buat fail. Cuba lagi.');
    }
  };

  if (loading && parcels.length === 0) {
    return <div className="fixed inset-0 flex items-center justify-center bg-slate-50"><span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-red-500 animate-spin" /></div>;
  }
  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-6 text-center flex flex-col gap-2">
          <p className="text-lg font-extrabold text-red-500 m-0">gerak</p>
          <p className="text-sm font-semibold text-slate-800 m-0">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-slate-50 text-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-extrabold text-red-500 tracking-tight">gerak</span>
            <span className="text-slate-400 font-semibold">×</span>
            <span className="text-lg font-extrabold text-red-600 tracking-wide">J&amp;T EXPRESS</span>
          </div>
          <h1 className="text-xl font-bold m-0">Jubah Postage — {parcels.length} parcel</h1>
          <p className="text-sm text-slate-500 m-0">
            Tekan <b>Copy</b> pada setiap ruangan dan tampal dalam sistem J&amp;T. Ruangan yang dah di-copy jadi gelap, dan kad tutup sendiri bila semua dah di-copy.
          </p>
          {expiresAt && <p className="text-xs text-slate-400 m-0">Link ini tamat pada {new Date(expiresAt).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}.</p>}
        </header>

        {/* Sender per runner — same for all of that runner's parcels */}
        <section className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">Pengirim (Sender)</h2>
          {runners.filter(r => runner === 'all' || r.name === runner).map(r => (
            <div key={r.name} className="flex flex-col gap-2">
              <span className="text-sm font-bold">{firstName(r.name)}</span>
              {r.sender ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SENDER_FIELDS.map(f => {
                    const k = `${r.name}:${f.key}`;
                    const value = f.key === 'phone' ? cleanPhone(r.sender![f.key]) : r.sender![f.key];
                    return <FieldBox key={k} label={f.label} value={value} mono={f.mono} wide={f.wide} copied={!!senderCopied[k]}
                      onCopy={async () => { if (await copyToClipboard(value)) { setSenderCopied(s => ({ ...s, [k]: true })); flash(`Copied: ${value}`); } }} />;
                  })}
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 m-0">Info pengirim untuk runner ini belum diisi. Hubungi Gerak.</p>
              )}
            </div>
          ))}
        </section>

        {/* Progress + filters */}
        <div className="sticky top-0 z-10 bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <strong className="text-sm tabular-nums whitespace-nowrap">{doneCount} / {parcels.length} siap</strong>
            <div className="flex-1 min-w-[120px] h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${parcels.length ? (doneCount / parcels.length) * 100 : 0}%` }} />
            </div>
            <button type="button" onClick={() => download('csv')} className="flex items-center gap-1.5 text-xs font-bold border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"><Download className="w-3.5 h-3.5" />CSV</button>
            <button type="button" onClick={() => download('xlsx')} className="flex items-center gap-1.5 text-xs font-bold border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"><Download className="w-3.5 h-3.5" />Excel</button>
            <button type="button" onClick={() => void load()} aria-label="Refresh" className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={runner} onChange={e => setRunner(e.target.value)} aria-label="Pengirim" className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <option value="all">Semua pengirim</option>
              {runners.map(r => <option key={r.name} value={r.name}>{firstName(r.name)}</option>)}
            </select>
            <select value={zone} onChange={e => setZone(e.target.value as typeof zone)} aria-label="Zon" className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <option value="all">SM + SS</option><option value="SM">Semenanjung</option><option value="SS">Sabah &amp; Sarawak</option>
            </select>
            <select value={show} onChange={e => setShow(e.target.value as typeof show)} aria-label="Status" className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
              <option value="todo">Belum siap</option><option value="all">Semua</option><option value="done">Dah siap</option>
            </select>
            <label className="flex-1 min-w-[160px] flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama / no. order" className="flex-1 min-w-0 bg-transparent py-2 text-sm focus:outline-none" />
            </label>
          </div>
        </div>

        <main className="flex flex-col gap-3">
          {visible.length === 0 && <p className="text-center text-sm text-slate-400 py-8">Tiada parcel untuk penapis ini.</p>}
          {visible.map((p, i) => {
            const nCopied = FIELDS.filter(f => p.copied.includes(f.key)).length;
            const trk = trackDraft[p.id] ?? p.tracking_no ?? '';
            return (
              <article key={p.id} className={`rounded-2xl border p-3.5 flex flex-col gap-3 ${p.done ? 'bg-slate-900 border-slate-900' : TINTS[i % TINTS.length]}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-mono text-xs font-bold rounded-md px-2 py-0.5 ${p.done ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'}`}>No. {p.order_no}</span>
                  <span className={`font-mono text-xs font-semibold ${p.done ? 'text-slate-500' : 'text-red-500'}`}>{p.reference}</span>
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${p.zone === 'SS' ? 'bg-red-100 text-red-600' : 'bg-white/70 text-slate-500'}`}>{p.zone === 'SS' ? 'Sabah & Sarawak' : 'Semenanjung'}</span>
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${p.done ? 'bg-slate-800 text-slate-400' : 'bg-white/70 text-slate-500'}`}>Pengirim: {firstName(p.rider_name)}</span>
                  <span className="flex-1" />
                  {p.done
                    ? <span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" />SIAP</span>
                    : <span className="text-xs text-slate-500 tabular-nums">{nCopied}/{FIELDS.length} copied</span>}
                </div>

                {p.done ? (
                  <p className="text-sm text-slate-300 m-0">{p.fields.name} · {p.fields.postcode} {p.fields.city}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FIELDS.map(f => (
                      <FieldBox key={f.key} label={f.label} value={p.fields[f.key]} mono={f.mono} wide={f.wide}
                        copied={p.copied.includes(f.key)} onCopy={() => void copyField(p, f.key)} />
                    ))}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap items-center">
                  <input value={trk} onChange={e => setTrackDraft(d => ({ ...d, [p.id]: e.target.value }))}
                    onBlur={() => void saveTracking(p)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder="No. tracking J&T" aria-label={`Tracking number for order ${p.order_no}`}
                    className={`flex-1 min-w-[180px] font-mono text-sm rounded-lg px-3 py-2 border focus:outline-none ${p.done ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500' : 'bg-white border-slate-200 focus:border-slate-500'}`} />
                  {p.tracking_no && (
                    <a href={JNT_TRACK(p.tracking_no)} target="_blank" rel="noopener noreferrer"
                      className={`text-xs font-bold flex items-center gap-1 ${p.done ? 'text-red-400' : 'text-red-600'} hover:underline`}>
                      Semak di J&amp;T <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {p.done
                    ? <button type="button" onClick={() => void setDone(p, false)} className="flex items-center gap-1.5 text-xs font-bold rounded-lg px-3 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800"><RotateCcw className="w-3.5 h-3.5" />Buka semula</button>
                    : <button type="button" onClick={() => void setDone(p, true)} className="text-xs font-bold rounded-lg px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700">Siap ✓</button>}
                </div>
              </article>
            );
          })}
        </main>
      </div>
      {toast && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-5 bg-slate-900 text-white text-sm font-semibold rounded-xl px-4 py-2.5 shadow-lg max-w-[calc(100%-2rem)]">{toast}</div>
      )}
    </div>
  );
}
