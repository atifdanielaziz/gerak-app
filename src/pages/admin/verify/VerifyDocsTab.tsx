import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { AlertCircle, ShieldCheck, ShieldOff, ExternalLink } from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';

type VerifyDoc = {
  id: string; name: string; gerak_id: string; campus: string; role: string;
  license_url: string | null;
  docs_status: string; docs_reject_reason: string | null;
};

export interface VerifyDocsTabHandle {
  reload: () => void;
}

interface VerifyDocsTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: 'Pekan' | 'Gambang';
  showToast: (msg: string) => void;
}

// Driver/rider driving-licence verification — split out of AdminHome.tsx.
// Neither role needs an IC on file; that's still collected separately by
// the (unrelated) Jubah booking flow for customers. Fully self-contained:
// no overlay modal (the reject-reason input expands inline in the card),
// so no modal-open tracking needed.
export const VerifyDocsTab = forwardRef<VerifyDocsTabHandle, VerifyDocsTabProps>(function VerifyDocsTab(
  { active, isSuperAdmin, adminCampus, showToast },
  ref
) {
  const [verifyDocs, setVerifyDocs] = useState<VerifyDoc[]>([]);
  // Real total vs verifyDocs.length, which is capped below — only used to
  // show "showing X of Y" if that cap is ever actually hit.
  const [verifyDocsTotalCount, setVerifyDocsTotalCount] = useState<number | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyFilter, setVerifyFilter] = useState<'driver' | 'rider'>('driver');
  const [verifyStatusFilter, setVerifyStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'none' | 'all'>('pending');
  const [verifySearch, setVerifySearch] = useState('');
  const [rejectingDoc, setRejectingDoc] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadVerifyDocs = useCallback(async () => {
    setVerifyLoading(true);
    let q = supabase.from('profiles')
      .select('id,name,gerak_id,campus,role,license_url,docs_status,docs_reject_reason', { count: 'exact' })
      .eq('role', verifyFilter)
      .order('name')
      .limit(1000);
    if (!isSuperAdmin) q = q.eq('campus', adminCampus);
    const { data, count } = await q;
    setVerifyDocsTotalCount(count ?? null);
    setVerifyDocs((data as VerifyDoc[]) ?? []);
    setVerifyLoading(false);
  }, [verifyFilter, isSuperAdmin, adminCampus]);

  useLoadOnActive(active, loadVerifyDocs);
  useImperativeHandle(ref, () => ({ reload: loadVerifyDocs }), [loadVerifyDocs]);

  const handleApproveDoc = async (userId: string) => {
    await supabase.rpc('approve_driver_docs', { p_user_id: userId });
    showToast('Documents approved.');
    loadVerifyDocs();
  };

  const handleRejectDoc = async (userId: string) => {
    if (!rejectReason.trim()) { showToast('Please enter a rejection reason.'); return; }
    await supabase.rpc('reject_driver_docs', { p_user_id: userId, p_reason: rejectReason.trim() });
    showToast('Documents rejected.');
    setRejectingDoc(null);
    setRejectReason('');
    loadVerifyDocs();
  };

  // Was recomputed raw on every render — memoized so a search keystroke
  // doesn't re-filter the full list synchronously each time.
  const filteredVerifyDocs = useMemo(() => verifyDocs.filter(d =>
    (verifyStatusFilter === 'all' || d.docs_status === verifyStatusFilter) &&
    (!verifySearch.trim() ||
      d.name.toLowerCase().includes(verifySearch.toLowerCase()) ||
      d.gerak_id.toLowerCase().includes(verifySearch.toLowerCase()))
  ), [verifyDocs, verifyStatusFilter, verifySearch]);

  return (
    <div className="flex flex-col gap-4">

      {/* Driver / Rider toggle */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
        {(['driver', 'rider'] as const).map(r => (
          <button key={r} onPointerDown={(e) => { e.preventDefault(); setVerifyFilter(r); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-transform ${
              verifyFilter === r ? 'bg-primary text-white' : 'text-slate-400'
            }`}>
            {r === 'driver' ? 'Drivers' : 'Riders'}
          </button>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
        {([
          { id: 'all',      label: 'All' },
          { id: 'pending',  label: 'Pending' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'none',     label: 'None' },
        ] as const).map(f => (
          <button key={f.id} onPointerDown={e => { e.preventDefault(); setVerifyStatusFilter(f.id); }}
            className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition-transform ${
              verifyStatusFilter === f.id ? 'bg-white text-slate-800' : 'text-slate-400'
            }`}>
            {f.label} ({f.id === 'all' ? verifyDocs.length : verifyDocs.filter(d => d.docs_status === f.id).length})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> Find {verifyFilter === 'driver' ? 'Driver' : 'Rider'}
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={verifySearch}
            onChange={e => setVerifySearch(e.target.value)}
            placeholder="Name or Gerak ID"
            style={{ fontSize: '12px' }}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
          />
          <button
            onClick={() => setVerifySearch('')}
            disabled={!verifySearch.trim()}
            className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            Clear
          </button>
        </div>
      </div>

      {verifyDocsTotalCount !== null && verifyDocsTotalCount > verifyDocs.length && (
        <p className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Showing {verifyDocs.length} of {verifyDocsTotalCount} — use search to find someone else.
        </p>
      )}

      {/* Doc list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" /> Document Verification
        </h3>

        <div className="overflow-y-auto no-scrollbar max-h-[520px] flex flex-col gap-4">
        {verifyLoading ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : filteredVerifyDocs.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No {verifyFilter}s found.</p>
        ) : filteredVerifyDocs.map(d => (
          <div key={d.id} className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-800 truncate">{d.name}</p>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">{d.gerak_id} · UMPSA {d.campus}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full border shrink-0 ${
                d.docs_status === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                d.docs_status === 'rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                d.docs_status === 'pending'  ? 'bg-amber-50 border-amber-100 text-amber-700' :
                'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {d.docs_status === 'approved' ? '✓ Approved' :
                 d.docs_status === 'rejected' ? '✗ Rejected' :
                 d.docs_status === 'pending'  ? '⏳ Pending' : 'Not Uploaded'}
              </span>
            </div>

            {/* Reject reason */}
            {d.docs_status === 'rejected' && d.docs_reject_reason && (
              <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3 py-2">
                Reason: {d.docs_reject_reason}
              </p>
            )}

            {/* Document links — only a license is ever required now */}
            <div className="grid grid-cols-1 gap-2">
              <a href={d.license_url ?? '#'} target="_blank" rel="noopener noreferrer"
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition ${
                  d.license_url ? 'bg-blue-50 border-blue-100 text-blue-600 active:scale-95' : 'bg-slate-50 border-slate-200 text-slate-300 pointer-events-none'
                }`}>
                <ExternalLink className="w-3 h-3" /> License
              </a>
            </div>

            {/* Reject reason input */}
            {rejectingDoc === d.id && (
              <div className="flex flex-col gap-2">
                <input
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary transition"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleRejectDoc(d.id)}
                    className="flex-1 bg-red-500 text-white text-xs font-semibold py-2 rounded-xl active:scale-95 transition">
                    Confirm Reject
                  </button>
                  <button onClick={() => { setRejectingDoc(null); setRejectReason(''); }}
                    className="flex-1 bg-slate-100 text-slate-500 text-xs font-semibold py-2 rounded-xl active:scale-95 transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Actions — a license on file is all that's needed to approve */}
            {d.docs_status !== 'approved' && rejectingDoc !== d.id && !!d.license_url && (
              <div className="flex gap-2">
                <button onClick={() => handleApproveDoc(d.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition">
                  <ShieldCheck className="w-3.5 h-3.5" /> Approve
                </button>
                <button onClick={() => { setRejectingDoc(d.id); setRejectReason(''); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 border border-red-100 text-red-500 text-xs font-semibold py-2.5 rounded-xl active:scale-95 transition">
                  <ShieldOff className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            )}

            {d.docs_status === 'approved' && (
              <button onClick={() => { setRejectingDoc(d.id); setRejectReason(''); }}
                className="w-full flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-400 text-xs font-semibold py-2 rounded-xl active:scale-95 transition">
                <ShieldOff className="w-3 h-3" /> Revoke Approval
              </button>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
});
