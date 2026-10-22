import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getJubahDocSignedUrl, openInNewTab } from '../lib/jubahDocs';
import { jubahLinkMeMsg } from '../lib/jubahStatus';
import { WaIcon, toWa } from '../lib/whatsapp';
import { PdfThumb } from './PdfThumb';

// Document gallery for Jubah bookings, with a tab per document:
//  - LinkMe slip: the alumni verification slip the souvenir counter asks for.
//  - Konvo Slip: the convocation slip (shows the Runner name after the ICMS
//    change), uploaded with the booking.
// Filterable by faculty (and rider, in superadmin's Admin > Jubah view) and
// uploaded/missing, so staff can find a student's document at the counter
// quickly. Rider Hub shows the rider's own bookings; thumbnails are signed
// URLs (riders can read their own bookings' files under the jubah-docs RLS).

export type LinkMeGalleryJob = {
  id: string; reference: string; full_name: string; faculty: string | null; hp_number: string;
  order_no?: number | null; linkme_path?: string | null; linkme_uploaded_at?: string | null; status: string;
  konvo_path?: string | null;
  rider_name?: string | null;
};

type Doc = 'linkme' | 'konvo';
type Sort = 'faculty' | 'name' | 'no' | 'recent';
const isImage = (p: string) => /\.(jpe?g|png|webp)$/i.test(p);
const DOC_LABEL: Record<Doc, string> = { linkme: 'LinkMe Slip', konvo: 'Konvo Slip' };
const docPath = (j: LinkMeGalleryJob, doc: Doc) => (doc === 'linkme' ? j.linkme_path : j.konvo_path) ?? null;

// showRiderFilter: superadmin's Admin > Jubah view, which lists every rider's bookings.
export function JubahLinkMeGallery({ jobs, showToast, showRiderFilter = false, initialDoc = 'linkme' }: {
  jobs: LinkMeGalleryJob[]; showToast: (m: string) => void; showRiderFilter?: boolean; initialDoc?: Doc;
}) {
  const [doc, setDoc] = useState<Doc>(initialDoc);
  const [faculty, setFaculty] = useState('all');
  const [rider, setRider] = useState('all');
  const [show, setShow] = useState<'all' | 'uploaded' | 'missing'>('all');
  const [sort, setSort] = useState<Sort>('faculty');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  const allLive = useMemo(() => jobs.filter(j => j.status !== 'cancelled'), [jobs]);
  const riders = useMemo(() => [...new Set(allLive.map(j => j.rider_name ?? '—'))].sort(), [allLive]);
  const live = useMemo(() => allLive.filter(j => rider === 'all' || (j.rider_name ?? '—') === rider), [allLive, rider]);
  const faculties = useMemo(() => [...new Set(live.map(j => (j.faculty ?? '').trim() || '—'))].sort(), [live]);
  const uploadedCount = live.filter(j => docPath(j, doc)).length;

  // Signed URLs for thumbnails (images and PDFs), fetched in one call per batch.
  useEffect(() => {
    // Each path is requested once, even if signing fails, so this never loops.
    const paths = live.map(j => docPath(j, doc)).filter((p): p is string => !!p && !requested.current.has(p));
    if (paths.length === 0) return;
    paths.forEach(p => requested.current.add(p));
    supabase.storage.from('jubah-docs').createSignedUrls(paths, 3600).then(({ data }) => {
      const add: Record<string, string> = {};
      (data ?? []).forEach(d => { if (d.path && d.signedUrl) add[d.path] = d.signedUrl; });
      if (Object.keys(add).length) setThumbs(prev => ({ ...prev, ...add }));
    });
  }, [live, doc]);

  const visible = live
    .filter(j => faculty === 'all' || ((j.faculty ?? '').trim() || '—') === faculty)
    .filter(j => show === 'all' || (show === 'uploaded' ? !!docPath(j, doc) : !docPath(j, doc)))
    .sort((a, b) => {
      if (sort === 'faculty') return (a.faculty ?? '').localeCompare(b.faculty ?? '') || a.full_name.localeCompare(b.full_name);
      if (sort === 'name') return a.full_name.localeCompare(b.full_name);
      if (sort === 'no') return (a.order_no ?? 0) - (b.order_no ?? 0);
      return (b.linkme_uploaded_at ?? '').localeCompare(a.linkme_uploaded_at ?? '');
    });

  const open = async (path: string) => {
    const { url, error } = await getJubahDocSignedUrl(path);
    if (url) openInNewTab(url); else showToast(error ? `Couldn't open document: ${error}` : "Couldn't open document.");
  };

  const select = 'text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700';

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-4 flex flex-col gap-4">
      {/* Document tabs */}
      <div className="flex bg-slate-50 border border-slate-100 rounded-2xl p-1 gap-1">
        {(['linkme', 'konvo'] as const).map(d => (
          <button key={d} type="button" onClick={() => { setDoc(d); if (d === 'konvo' && sort === 'recent') setSort('faculty'); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${doc === d ? 'bg-primary text-white' : 'text-slate-500'}`}>
            {DOC_LABEL[d]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 m-0">{DOC_LABEL[doc]}s</h3>
        <span className="text-xs text-slate-400 tabular-nums">{uploadedCount}/{live.length} uploaded</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {showRiderFilter && (
          <select value={rider} onChange={e => setRider(e.target.value)} aria-label="Rider" className={select}>
            <option value="all">All riders</option>
            {riders.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <select value={faculty} onChange={e => setFaculty(e.target.value)} aria-label="Faculty" className={select}>
          <option value="all">All faculties</option>
          {faculties.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={show} onChange={e => setShow(e.target.value as typeof show)} aria-label="Show" className={select}>
          <option value="all">Uploaded + missing</option>
          <option value="uploaded">Uploaded only</option>
          <option value="missing">Missing only</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" className={select}>
          <option value="faculty">Sort: Faculty</option>
          <option value="name">Sort: Name</option>
          <option value="no">Sort: Order No.</option>
          {doc === 'linkme' && <option value="recent">Sort: Latest upload</option>}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8 m-0">No bookings for this filter.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visible.map(j => {
            const path = docPath(j, doc);
            return (
              <div key={j.id} className={`rounded-2xl border overflow-hidden flex flex-col ${path ? 'border-slate-100' : 'border-red-200'}`}>
                {path ? (
                  <button type="button" onClick={() => void open(path)} aria-label={`Open ${DOC_LABEL[doc]} of ${j.full_name}`}
                    className="aspect-[3/4] bg-slate-50 flex items-center justify-center overflow-hidden active:opacity-80">
                    {isImage(path)
                      ? (thumbs[path]
                        ? <img src={thumbs[path]} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                        : <span className="flex flex-col items-center gap-1 text-slate-400"><FileText className="w-8 h-8" /><span className="text-[10px] font-semibold">Loading…</span></span>)
                      : <PdfThumb url={thumbs[path]} />}
                  </button>
                ) : (
                  <div className="aspect-[3/4] bg-red-50 flex flex-col items-center justify-center gap-2 p-2 text-center">
                    <ImageOff className="w-7 h-7 text-red-300" />
                    <span className="text-[11px] font-semibold text-red-500">Not uploaded</span>
                    {doc === 'linkme' && (
                      <a href={`https://wa.me/${toWa(j.hp_number)}?text=${encodeURIComponent(jubahLinkMeMsg(j.full_name, j.reference))}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-lg px-2 py-1">
                        <WaIcon className="w-3.5 h-3.5 text-[#25D366]" /> Minta slip
                      </a>
                    )}
                  </div>
                )}
                <div className="px-2.5 py-2 flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] font-semibold text-slate-800 leading-tight line-clamp-2">{j.full_name}</span>
                  <span className="text-[10px] text-slate-400 truncate">{j.order_no ? `No. ${j.order_no} · ` : ''}{(j.faculty ?? '').trim() || '—'}</span>
                  {showRiderFilter && <span className="text-[10px] text-slate-400 truncate">{(j.rider_name ?? '—').split(' ').slice(0, 2).join(' ')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
