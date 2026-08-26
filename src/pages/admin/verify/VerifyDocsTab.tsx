import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ExternalLink, MoreVertical, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { decideDocuments } from '../../../lib/documentVerification';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import type { ProfileUser } from '../users/ProfileSheet';
import { NativeSelect } from '../../../components/NativeSelect';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';
import { UNIVERSITY_MAP } from '../../../lib/universities';

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
  universityKey: string;
  showToast: (msg: string) => void;
  onViewProfile: (u: ProfileUser) => void;
}

export const VerifyDocsTab = forwardRef<VerifyDocsTabHandle, VerifyDocsTabProps>(function VerifyDocsTab(
  { active, universityKey, showToast, onViewProfile }, ref
) {
  const tableScrollRef = useAxisLockedScroll<HTMLDivElement>();
  const [docs, setDocs] = useState<VerifyDoc[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'driver' | 'rider'>('driver');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'none' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const loadDocs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('profiles')
      .select('id,name,gerak_id,campus,role,email,phone,status,license_url,docs_status,docs_reject_reason', { count: 'exact' })
      .eq('role', roleFilter).order('name').limit(1000);
    const campuses = UNIVERSITY_MAP[universityKey]?.campuses ?? [];
    if (campuses.length) query = query.in('campus', campuses);
    const { data, count } = await query;
    setDocs((data as VerifyDoc[]) ?? []);
    setTotalCount(count ?? null);
    setLoading(false);
  }, [roleFilter, universityKey]);

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
    <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Find {roleFilter === 'driver' ? 'Driver' : 'Rider'}</h3>
      <div className="flex gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or Gerak ID"
          className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-normal text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-slate-900 transition-colors" />
        <button type="button" disabled={!search.trim()} onPointerDown={e => { e.preventDefault(); setSearch(''); }}
          className="px-3.5 bg-primary text-white text-xs font-semibold rounded-xl disabled:opacity-40 active:scale-[0.99] transition-transform transform-gpu">Clear</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all', label: 'All Statuses' }, { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
          { value: 'none', label: 'Not Uploaded' },
        ]} />
        <NativeSelect value={roleFilter} onChange={setRoleFilter} options={[{ value: 'driver', label: 'Driver' }, { value: 'rider', label: 'Rider' }]} />
      </div>
    </div>

    {totalCount !== null && totalCount > docs.length && <p className="text-xs text-amber-600 font-semibold">Showing {docs.length} of {totalCount}; use search to find someone else.</p>}

    <section className="bg-white border border-slate-100 rounded-3xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3"><Users className="w-4 h-4 text-slate-400" /> Document Directory</h3>
      <div ref={tableScrollRef} className="table-scroll-x relative w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-none" style={{ contain: 'layout paint' }}>
      <div data-axis-y className="max-h-[560px] overflow-y-auto overflow-x-hidden overscroll-none no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
      {loading ? <div className="flex justify-center py-8"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>
      : filtered.length === 0 ? <p className="text-xs text-slate-400 text-center py-6">No {roleFilter}s found.</p>
      : <table className="min-w-[760px] w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-white"><tr className="text-slate-400">{['Name','Role','Gerak ID','Campus','Email','Status',''].map(h => <th key={h} className="py-2.5 pr-4 font-semibold border-b border-slate-100 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{filtered.map(d => <tr key={d.id} onClick={() => onViewProfile(profileUser(d))} className="border-b border-slate-100 last:border-b-0 active:bg-slate-50 cursor-pointer">
        <td className="py-3 pr-4 font-semibold text-slate-800 max-w-[190px] truncate">{d.name}</td><td className="py-3 pr-4 text-slate-600 capitalize">{d.role}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{d.gerak_id}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{d.campus}</td><td className="py-3 pr-4 text-slate-600">{d.email}</td><td className={`py-3 pr-4 font-semibold whitespace-nowrap ${d.docs_status === 'approved' ? 'text-emerald-600' : d.docs_status === 'rejected' ? 'text-red-500' : d.docs_status === 'pending' ? 'text-amber-600' : 'text-slate-400'}`}>{d.docs_status === 'none' ? 'Not Uploaded' : d.docs_status.charAt(0).toUpperCase() + d.docs_status.slice(1)}</td><td className="relative py-2 pr-0" onClick={e => e.stopPropagation()}><div className="relative">
        <button type="button" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setMenuPosition({ top: Math.min(rect.bottom + 4, window.innerHeight - 210), left: Math.max(8, rect.right - 190) }); setOpenMenuId(v => v === d.id ? null : d.id); }} className="w-8 h-8 flex items-center justify-center text-slate-400 active:scale-90 transition-transform transform-gpu"><MoreVertical className="w-4 h-4" /></button>
        {openMenuId === d.id && createPortal(<><div className="fixed inset-0 z-[90]" onPointerDown={e => { e.preventDefault(); setOpenMenuId(null); }} /><div className="fixed z-[100] min-w-[190px] overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-xl" style={{ top: menuPosition.top, left: menuPosition.left }}>
          {d.license_url && <a href={d.license_url} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuId(null)} className="flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-600 active:bg-slate-50"><ExternalLink className="w-4 h-4 text-slate-400" /> View License</a>}
          {d.license_url && d.docs_status !== 'approved' && <button type="button" onPointerDown={e => { e.preventDefault(); setOpenMenuId(null); void approve(d.id); }} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-emerald-600 active:bg-slate-50"><ShieldCheck className="w-4 h-4" /> Approve</button>}
          {d.license_url && d.docs_status === 'approved' && <button type="button" onPointerDown={e => { e.preventDefault(); setOpenMenuId(null); void revoke(d.id); }} className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-primary active:bg-slate-50"><ShieldOff className="w-4 h-4" /> Revoke Approval</button>}
          {d.phone && <a href={`https://wa.me/${toWa(d.phone)}?text=${encodeURIComponent(`Assalamualaikum ${d.name} 👋, admin Gerak di sini. Sila muat naik gambar lesen memandu anda dalam aplikasi Gerak untuk tujuan pengesahan. Terima kasih 🙏`)}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpenMenuId(null)} className="flex items-center gap-3 px-4 py-3 text-xs font-semibold text-[#25D366] active:bg-slate-50"><WaIcon className="w-4 h-4" /> WhatsApp</a>}
        </div></>, document.body)}</div></td>
      </tr>)}</tbody></table>}
      </div></div>
    </section>
  </div>;
});
