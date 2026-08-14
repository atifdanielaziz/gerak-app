import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, MoreVertical, ShieldCheck, ShieldOff } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { decideDocuments } from '../../../lib/documentVerification';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import type { ProfileUser } from '../users/ProfileSheet';

type VerifyDoc = {
  id: string; name: string; gerak_id: string; campus: string; role: string;
  email: string; phone: string | null; status: string;
  license_url: string | null; docs_status: string; docs_reject_reason: string | null;
};

export interface VerifyDocsTabHandle { reload: () => void; }

interface VerifyDocsTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: string;
  showToast: (msg: string) => void;
  onViewProfile: (u: ProfileUser) => void;
}

export const VerifyDocsTab = forwardRef<VerifyDocsTabHandle, VerifyDocsTabProps>(function VerifyDocsTab(
  { active, isSuperAdmin, adminCampus, showToast, onViewProfile }, ref
) {
  const [docs, setDocs] = useState<VerifyDoc[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'driver' | 'rider'>('driver');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'none' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('profiles')
      .select('id,name,gerak_id,campus,role,email,phone,status,license_url,docs_status,docs_reject_reason', { count: 'exact' })
      .eq('role', roleFilter).order('name').limit(1000);
    if (!isSuperAdmin) query = query.eq('campus', adminCampus);
    const { data, count } = await query;
    setDocs((data as VerifyDoc[]) ?? []);
    setTotalCount(count ?? null);
    setLoading(false);
  }, [roleFilter, isSuperAdmin, adminCampus]);

  useLoadOnActive(active, loadDocs);
  useImperativeHandle(ref, () => ({ reload: loadDocs }), [loadDocs]);

  const approve = async (id: string) => {
    const result = await decideDocuments(id, 'approved');
    if (!result.success) return showToast(result.error ?? 'Could not approve documents.');
    showToast(result.emailSent === false ? 'Documents approved. Email could not be sent.' : 'Documents approved. Email sent.');
    void loadDocs();
  };

  const revoke = async (id: string) => {
    const reason = 'Approval revoked by an administrator. Please upload a valid driving licence for verification.';
    const result = await decideDocuments(id, 'rejected', reason);
    if (!result.success) return showToast(result.error ?? 'Could not revoke approval.');
    showToast(result.emailSent === false ? 'Approval revoked. Email could not be sent.' : 'Approval revoked. Email sent.');
    void loadDocs();
  };

  const filtered = useMemo(() => docs.filter(d =>
    (statusFilter === 'all' || d.docs_status === statusFilter) &&
    (!search.trim() || d.name.toLowerCase().includes(search.toLowerCase()) || d.gerak_id.toLowerCase().includes(search.toLowerCase()))
  ), [docs, statusFilter, search]);

  const profileUser = (d: VerifyDoc): ProfileUser => ({
    id: d.id, name: d.name, gerak_id: d.gerak_id, role: d.role, campus: d.campus,
    email: d.email, phone: d.phone ?? '', status: d.status, license_url: d.license_url ?? undefined,
    docs_status: d.docs_status, docs_reject_reason: d.docs_reject_reason,
  });

  return <div className="flex flex-col gap-4">
    <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
      {(['driver', 'rider'] as const).map(role => <button key={role} type="button"
        onPointerDown={e => { e.preventDefault(); setRoleFilter(role); }}
        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-transform transform-gpu ${roleFilter === role ? 'bg-primary text-white' : 'text-slate-400'}`}>
        {role === 'driver' ? 'Drivers' : 'Riders'}
      </button>)}
    </div>

    <div className="flex bg-slate-50 border border-slate-100 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
      {(['all', 'pending', 'approved', 'rejected', 'none'] as const).map(value => {
        const count = value === 'all' ? docs.length : docs.filter(d => d.docs_status === value).length;
        return <button key={value} type="button" onPointerDown={e => { e.preventDefault(); setStatusFilter(value); }}
          className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-transform transform-gpu ${statusFilter === value ? 'bg-white text-slate-800' : 'text-slate-400'}`}>
          {value === 'none' ? 'Not Uploaded' : value} ({count})
        </button>;
      })}
    </div>

    <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Find {roleFilter === 'driver' ? 'Driver' : 'Rider'}</h3>
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or Gerak ID"
          className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs font-normal text-slate-700 focus:outline-none focus:border-slate-900" />
        <button type="button" disabled={!search.trim()} onPointerDown={e => { e.preventDefault(); setSearch(''); }}
          className="px-3.5 bg-primary text-white text-xs font-semibold rounded-xl disabled:opacity-40 active:scale-[0.99] transition-transform transform-gpu">Clear</button>
      </div>
    </div>

    {totalCount !== null && totalCount > docs.length && <p className="text-xs text-amber-600 font-semibold">Showing {docs.length} of {totalCount}; use search to find someone else.</p>}

    <div className="flex flex-col gap-2">
      {loading ? <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>
      : filtered.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">No {roleFilter}s found.</p>
      : filtered.map(d => <div key={d.id} className="relative bg-white border border-slate-100 rounded-2xl p-5">
        <button type="button" onClick={() => onViewProfile(profileUser(d))} className="w-full min-w-0 text-left pr-9 active:opacity-70 transition-opacity">
          <div className="flex items-center gap-2 flex-wrap"><p className="text-xs font-black text-slate-800 truncate">{d.name}</p><span className="text-xs font-semibold uppercase text-emerald-600">{d.role}</span></div>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">{d.gerak_id} · UMPSA {d.campus}</p>
          <p className="text-xs text-slate-400 truncate">{d.email}</p>
          <p className={`text-xs font-semibold mt-2 ${d.docs_status === 'approved' ? 'text-emerald-600' : d.docs_status === 'rejected' ? 'text-red-500' : d.docs_status === 'pending' ? 'text-amber-600' : 'text-slate-400'}`}>
            {d.docs_status === 'approved' ? 'Approved' : d.docs_status === 'rejected' ? 'Rejected' : d.docs_status === 'pending' ? 'Pending' : 'Not Uploaded'}
          </p>
        </button>
        <button type="button" onPointerDown={e => { e.preventDefault(); setOpenMenuId(v => v === d.id ? null : d.id); }} className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center text-slate-400 active:scale-90 transition-transform transform-gpu"><MoreVertical className="w-4 h-4" /></button>
        {openMenuId === d.id && <><div className="fixed inset-0 z-40" onPointerDown={e => { e.preventDefault(); setOpenMenuId(null); }} /><div className="absolute right-4 top-12 z-50 min-w-[190px] overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-xl">
          {d.license_url && <a href={d.license_url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuId(null)} className="flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-600 active:bg-slate-50"><ExternalLink className="w-4 h-4 text-slate-400" /> View License</a>}
          {d.license_url && d.docs_status !== 'approved' && <button type="button" onPointerDown={e => { e.preventDefault(); setOpenMenuId(null); void approve(d.id); }} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-emerald-600 active:bg-slate-50"><ShieldCheck className="w-4 h-4" /> Approve</button>}
          {d.license_url && d.docs_status === 'approved' && <button type="button" onPointerDown={e => { e.preventDefault(); setOpenMenuId(null); void revoke(d.id); }} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-primary active:bg-slate-50"><ShieldOff className="w-4 h-4" /> Revoke Approval</button>}
          {d.phone && <a href={`https://wa.me/${toWa(d.phone)}?text=${encodeURIComponent(`Assalamualaikum ${d.name} 👋, admin Gerak di sini. Sila muat naik gambar lesen memandu anda dalam aplikasi Gerak untuk tujuan pengesahan. Terima kasih 🙏`)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuId(null)} className="flex items-center gap-3 px-4 py-3 text-xs font-semibold text-[#25D366] active:bg-slate-50"><WaIcon className="w-4 h-4" /> WhatsApp</a>}
        </div></>}
      </div>)}
    </div>
  </div>;
});
