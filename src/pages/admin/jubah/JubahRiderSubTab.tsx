import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  GraduationCap, Users, X, MinusCircle, PlusCircle, Minus, Pencil,
} from 'lucide-react';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import { NativeSelect } from '../../../components/NativeSelect';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { JUBAH_UNIVERSITY_MAP, jubahLocationLabel, universityKeyFromCampus } from '../../../lib/jubahUniversities';
import { useApp } from '../../../context/AppContext';

type JubahRider = {
  id: string; name: string; gerak_id: string; campus: string; status: string; can_robe: boolean;
  ic_number: string | null; phone: string | null; jubah_method: string | null; jubah_drop_point: string | null;
};
type JubahAssignment = {
  id: string; rider_id: string; name: string; drop_point: string | null; method: string; campus: string;
  ic_number: string | null; phone: string | null;
};

// ── Jubah rider assignment sheet ─────────────────────────────────────────────
const JubahRiderSheet: React.FC<{
  rider: { name: string; gerak_id: string; campus: string; ic_number: string | null; phone: string | null };
  method: 'pickup' | 'postage' | '';
  dropPoint: string;
  saving: boolean;
  assignments: { id: string; method: string; drop_point: string | null }[];
  onMethodChange: (m: 'pickup' | 'postage') => void;
  onDropPointChange: (v: string) => void;
  onSave: () => void;
  onAddAssignment: (method: 'pickup' | 'postage', dropPoint: string) => Promise<void>;
  onDeleteAssignment: (id: string) => Promise<void>;
  onClose: () => void;
}> = ({ rider, method, dropPoint, saving, assignments, onMethodChange, onDropPointChange, onSave, onAddAssignment, onDeleteAssignment, onClose }) => {
  const { showConfirmModal } = useApp();
  const [isEditingDropPoint, setIsEditingDropPoint] = useState(!dropPoint);
  const dropPointDisabled = method === 'postage' || !isEditingDropPoint;

  const [showAdd,    setShowAdd]    = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [addMethod,    setAddMethod]    = useState<'pickup' | 'postage'>('pickup');
  const [addDropPoint, setAddDropPoint] = useState('');
  const [addSaving,    setAddSaving]    = useState(false);

  const handleAdd = async () => {
    if (addMethod !== 'postage' && !addDropPoint.trim()) return;
    setAddSaving(true);
    await onAddAssignment(addMethod, addMethod === 'postage' ? '-' : addDropPoint.trim());
    setAddSaving(false);
    setShowAdd(false);
    setAddDropPoint('');
    setAddMethod('pickup');
  };

  // secondary = any assignments beyond the first (which was migrated from profiles)
  const secondary = assignments.slice(1);

  return (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center"
    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
    onPointerDown={(e) => { e.preventDefault(); onClose(); }}
  >
    <div
      className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex justify-center pt-3 pb-1 shrink-0">
        <div className="w-10 h-1 bg-slate-200 rounded-full" />
      </div>

      <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
        <p className="text-sm font-semibold text-slate-700">Jubah Rider</p>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {/* Avatar + name */}
        <div className="flex flex-col items-center px-5 pb-4 gap-2">
          <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg bg-blue-600 shadow-blue-200">
            <GraduationCap className="w-9 h-9 text-white" />
          </div>
          <div className="text-center mt-1">
            <p className="text-xl font-black text-slate-800">{rider.name}</p>
            <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2.5 py-1 rounded-full border bg-blue-50 border-blue-100 text-blue-600">
              <GraduationCap className="w-3 h-3" /> rider
            </span>
          </div>
        </div>

        {/* Info block */}
        <div className="mx-4 mb-4 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1.5 leading-relaxed">
          <p><span className="text-slate-400">Gerak ID:</span> <span className="text-blue-600 font-semibold">{rider.gerak_id}</span></p>
          <p><span className="text-slate-400">Campus:</span> {jubahLocationLabel(universityKeyFromCampus(rider.campus) ?? 'umpsa', rider.campus)}</p>
          <p><span className="text-slate-400">IC Number:</span> {rider.ic_number || '—'}</p>
          <div className="flex items-center gap-2">
            <span><span className="text-slate-400">H/P:</span> {rider.phone || '—'}</span>
            {rider.phone && (
              <a href={`https://wa.me/${toWa(rider.phone)}`} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-[#25D366] active:scale-90 transition shrink-0">
                <WaIcon className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Method + Drop point */}
        <div className="mx-4 mb-4 flex flex-col gap-5">

          {/* ── METHOD section ── */}
          <div className="flex flex-col gap-2">

            {/* METHOD 1 — primary (editable) */}
            <div className="flex flex-col gap-1">
              {/* Label row: dynamic "Method" vs "Method 1" + icon buttons */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-normal text-slate-400">
                  {(secondary.length > 0 || showAdd) ? 'Method 1' : 'Method'}
                </span>
                <div className="flex items-center gap-2">
                  {assignments.length > 1 && !showAdd && (
                    <button onPointerDown={e => { e.preventDefault(); setDeleteMode(v => !v); }} className="active:scale-90 transition-transform">
                      <MinusCircle className={`w-5 h-5 ${deleteMode ? 'text-red-500' : 'text-slate-300'}`} />
                    </button>
                  )}
                  {assignments.length < 3 && !deleteMode && (
                    <button onPointerDown={e => { e.preventDefault(); setShowAdd(v => !v); setAddDropPoint(''); setAddMethod('pickup'); }} className="active:scale-90 transition-transform">
                      <PlusCircle className={`w-5 h-5 ${showAdd ? 'text-indigo-500' : 'text-slate-300'}`} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {deleteMode && <Minus className="w-4 h-4 text-slate-200 shrink-0" />}
                <div className="flex-1">
                  <NativeSelect
                    value={method}
                    onChange={v => onMethodChange(v as 'pickup' | 'postage')}
                    options={[{ value: 'pickup', label: 'Pickup Only' }, { value: 'postage', label: 'Pickup & Postage' }]}
                    placeholder="Select method..."
                    label="Select Method"
                  />
                </div>
              </div>
            </div>

            {/* METHOD 2+ — secondary (read-only) */}
            {secondary.map((a, i) => (
              <div key={a.id} className="flex flex-col gap-1">
                <span className="text-xs font-normal text-slate-400">Method {i + 2}</span>
                <div className="flex items-center gap-2">
                  {deleteMode && (
                    <button
                      onClick={() => showConfirmModal({
                        title: 'Remove Method?',
                        message: 'This removes this delivery method from the rider\'s assignment.',
                        confirmLabel: 'REMOVE',
                        onConfirm: () => onDeleteAssignment(a.id),
                      })}
                      className="text-red-500 active:scale-90 transition shrink-0"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  )}
                  <div style={{ fontSize: '12px' }} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-600">
                    {a.method === 'pickup' ? 'Pickup Only' : 'Pickup & Postage'}
                  </div>
                </div>
              </div>
            ))}

            {/* New method input */}
            {showAdd && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-indigo-400">
                  Method {secondary.length + 2}
                </span>
                <NativeSelect
                  value={addMethod}
                  onChange={v => setAddMethod(v as 'pickup' | 'postage')}
                  options={[{ value: 'pickup', label: 'Pickup Only' }, { value: 'postage', label: 'Pickup & Postage' }]}
                  label="Select Method"
                />
              </div>
            )}
          </div>

          {/* ── DROP POINT section ── */}
          <div className="flex flex-col gap-2">

            {/* DROP POINT 1 — primary (editable) */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-normal text-slate-400">
                {(secondary.length > 0 || showAdd) ? 'Drop Point 1' : 'Drop Point'}
              </span>
              <div className="flex items-start gap-2">
                {deleteMode && <div className="w-4 shrink-0" />}
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    {method !== 'postage' && (
                      <button
                        type="button"
                        onPointerDown={(e) => { e.preventDefault(); setIsEditingDropPoint(v => !v); }}
                        className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border transition-transform active:scale-95 ${
                          isEditingDropPoint
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}
                      >
                        <Pencil className="w-2.5 h-2.5" /> {isEditingDropPoint ? 'Editing' : 'Edit'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={dropPoint}
                    onChange={e => onDropPointChange(e.target.value)}
                    placeholder="e.g. UMP Gambang Counter"
                    disabled={dropPointDisabled}
                    style={{ fontSize: '12px' }}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {method === 'postage' && (
                    <p className="text-xs text-slate-400 font-semibold">Not applicable — robe is couriered, no physical drop point needed.</p>
                  )}
                </div>
              </div>
            </div>

            {/* DROP POINT 2+ — secondary (read-only) */}
            {secondary.map((a, i) => (
              <div key={a.id} className="flex flex-col gap-1">
                <span className="text-xs font-normal text-slate-400">Drop Point {i + 2}</span>
                <div className="flex items-center gap-2">
                  {deleteMode && <div className="w-4 shrink-0" />}
                  <div style={{ fontSize: '12px' }} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-600">
                    {a.drop_point && a.drop_point !== '-' ? a.drop_point : '— (Postage, no drop point)'}
                  </div>
                </div>
              </div>
            ))}

            {/* New drop point input */}
            {showAdd && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-400">
                  Drop Point {secondary.length + 2}
                </span>
                {addMethod !== 'postage' ? (
                  <input
                    type="text"
                    value={addDropPoint}
                    onChange={e => setAddDropPoint(e.target.value)}
                    placeholder="e.g. Kolej Kediaman 3, Lobby A"
                    style={{ fontSize: '12px' }}
                    className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
                    autoFocus
                  />
                ) : (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-400 font-semibold">
                    Not applicable — robe is couriered.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer — sticky, always reachable */}
      <div className="px-4 pt-3 flex flex-col gap-3 shrink-0 border-t border-slate-100" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        {showAdd ? (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAdd(false); setAddDropPoint(''); setAddMethod('pickup'); }}
              className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3.5 rounded-2xl active:scale-95 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={addSaving || (addMethod !== 'postage' && !addDropPoint.trim())}
              className="flex-1 bg-indigo-600 text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {addSaving
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : 'Add Assignment'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { onSave(); setIsEditingDropPoint(false); }}
            disabled={saving || !method}
            className="w-full bg-primary text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving
              ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : 'Save Assignment'}
          </button>
        )}
      </div>
    </div>
  </div>
  );
};

export interface JubahRiderSubTabHandle {
  reload: () => void;
}

interface JubahRiderSubTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: 'Pekan' | 'Gambang';
  // Which university's riders to show for superadmin (regular admin still
  // uses adminCampus, same lock-in as every other campus-scoped admin tab).
  jubahUniversityView: string;
  showToast: (msg: string) => void;
  onModalOpenChange: (open: boolean) => void;
}

// Jubah rider directory + per-rider pickup/postage assignment — split out of
// AdminHome.tsx. Previously loaded as part of the monolithic loadJubahData()
// that also fetched bookings (used by the Customer sub-tab) — decomposed
// here into its own independent fetch of riders + their assignments only.
export const JubahRiderSubTab = forwardRef<JubahRiderSubTabHandle, JubahRiderSubTabProps>(function JubahRiderSubTab(
  { active, isSuperAdmin, adminCampus, jubahUniversityView, showToast, onModalOpenChange },
  ref
) {
  const [jubahRiders, setJubahRiders] = useState<JubahRider[]>([]);
  const [jubahRidersLoading, setJubahRidersLoading] = useState(false);
  const [jubahAssignments, setJubahAssignments] = useState<JubahAssignment[]>([]);
  const [dirSheet, setDirSheet] = useState<JubahAssignment | null>(null);
  const [jubahSheetRider, setJubahSheetRider] = useState<JubahRider | null>(null);
  const [jubahMethodDraft, setJubahMethodDraft] = useState<'pickup' | 'postage' | ''>('');
  const [jubahDropPointDraft, setJubahDropPointDraft] = useState('');
  const [savingJubahAssignment, setSavingJubahAssignment] = useState(false);

  useEffect(() => { onModalOpenChange(!!jubahSheetRider); }, [jubahSheetRider, onModalOpenChange]);

  const loadJubahRiders = useCallback(async () => {
    setJubahRidersLoading(true);
    let ridersQ = supabase.from('profiles')
      .select('id, name, gerak_id, campus, status, can_robe, ic_number, phone, jubah_method, jubah_drop_point')
      .eq('role', 'rider')
      .eq('can_robe', true)
      .order('name');
    ridersQ = isSuperAdmin
      ? ridersQ.in('campus', JUBAH_UNIVERSITY_MAP[jubahUniversityView]?.campuses ?? [])
      : ridersQ.eq('campus', adminCampus);
    const { data: ridersData } = await ridersQ;
    setJubahRiders((ridersData as JubahRider[]) ?? []);
    setJubahRidersLoading(false);

    // Load assignments for Representative Directory
    const riderIds = (ridersData ?? []).map((r: JubahRider) => r.id);
    if (riderIds.length > 0) {
      const { data: assignData } = await supabase
        .from('jubah_rider_assignments')
        .select('id, rider_id, drop_point, method, campus')
        .in('rider_id', riderIds)
        .eq('is_active', true)
        .order('created_at');
      const profileMap = Object.fromEntries((ridersData ?? []).map((r: JubahRider) => [r.id, r]));
      setJubahAssignments(
        (assignData ?? []).map((a: { id: string; rider_id: string; drop_point: string | null; method: string; campus: string }) => {
          const p = profileMap[a.rider_id] as JubahRider | undefined;
          return { ...a, name: p?.name ?? '—', ic_number: p?.ic_number ?? null, phone: p?.phone ?? null };
        })
      );
    } else {
      setJubahAssignments([]);
    }
  }, [isSuperAdmin, adminCampus, jubahUniversityView]);

  useLoadOnActive(active, loadJubahRiders);
  useImperativeHandle(ref, () => ({ reload: loadJubahRiders }), [loadJubahRiders]);

  const handleSaveJubahAssignment = async () => {
    if (!jubahSheetRider) return;
    setSavingJubahAssignment(true);
    const { error } = await supabase.rpc('set_rider_jubah_assignment', {
      p_user_id:    jubahSheetRider.id,
      p_method:     jubahMethodDraft || null,
      p_drop_point: jubahDropPointDraft.trim() || null,
    });
    setSavingJubahAssignment(false);
    if (error) { showToast('Failed to update assignment.'); return; }
    showToast(`${jubahSheetRider.name}'s assignment updated.`);
    setJubahSheetRider(null);
    loadJubahRiders();
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Rider cards — click to open assignment sheet */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4" /> Jubah Riders
          </h3>
          <div className="overflow-y-auto no-scrollbar max-h-[320px] flex flex-col gap-2">
            {jubahRidersLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : jubahRiders.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold text-center py-6">No Jubah riders found.</p>
            ) : jubahRiders.map(r => (
              <button key={r.id} type="button"
                onClick={() => {
                  // Seeded from the rider's real jubah_rider_assignments row
                  // (assignments is already sorted by created_at, so the
                  // first match is "Method 1") — not from
                  // profiles.jubah_method/jubah_drop_point, which turned out
                  // to be a disconnected legacy pair the actual booking flow
                  // never reads, and could silently drift out of sync with
                  // what's really assigned (confirmed live: exactly this
                  // happened for a rider whose profile said one thing while
                  // no matching assignment row existed at all).
                  const primary = jubahAssignments.find(a => a.rider_id === r.id);
                  setJubahSheetRider(r);
                  setJubahMethodDraft((primary?.method as 'pickup' | 'postage') || '');
                  setJubahDropPointDraft(primary?.drop_point || '');
                }}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border border-slate-100 bg-white active:opacity-70 transition text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">{r.gerak_id} · {jubahLocationLabel(universityKeyFromCampus(r.campus) ?? 'umpsa', r.campus)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                    r.status === 'active' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    {r.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Rider directory table */}
        {jubahAssignments.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Representative Directory
            </h3>
            {/* Split horizontal/vertical scroll across two nested containers
                — see JubahCustomerSubTab's identical table for why a single
                dual-axis scroll element causes erratic diagonal scrolling
                and an unreliable sticky header on mobile. */}
            <div className="overflow-x-auto no-scrollbar">
              <div className="overflow-y-auto no-scrollbar max-h-[320px]">
              <table className="min-w-full text-left border-collapse">
                {/* sticky+bg-white on each <th> individually, not on <thead> —
                    see JubahCustomerSubTab's identical table for why. */}
                <thead>
                  <tr className="text-xs font-normal text-slate-400 border-b border-slate-100">
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Method</th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">Representative Name</th>
                    <th className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap">I/C Number</th>
                    <th className="sticky top-0 bg-white py-2 whitespace-nowrap">H/P</th>
                  </tr>
                </thead>
                <tbody>
                  {jubahAssignments.map(a => {
                    return (
                      <tr key={a.id}
                        onClick={() => setDirSheet(a)}
                        className="border-b border-slate-100 text-xs cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition">
                        <td className="py-2.5 pr-4 text-slate-600 font-semibold align-top whitespace-nowrap">
                          {a.method === 'pickup' ? 'Pickup Only' : a.method === 'postage' ? 'Pickup & Postage' : '—'}
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-slate-800 align-top">{a.name}</td>
                        <td className="py-2.5 pr-4 font-mono text-slate-700 align-top whitespace-nowrap">{a.ic_number || '—'}</td>
                        <td className="py-2.5 text-slate-700 font-semibold align-top whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{a.phone || '—'}</span>
                            {a.phone && (
                              <a href={`https://wa.me/${toWa(a.phone)}`} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()} className="text-[#25D366] active:scale-90 transition shrink-0">
                                <WaIcon className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Representative Directory row sheet */}
      {dirSheet && (() => {
        const univ = JUBAH_UNIVERSITY_MAP[universityKeyFromCampus(dirSheet.campus) ?? 'umpsa']?.shortLabel ?? dirSheet.campus;
        const ic   = dirSheet.ic_number ? dirSheet.ic_number.replace(/\D/g,'').slice(0,6) + '-XX-XXXX' : null;
        const waMsg = `Asslammualaikum Jubah rider, saya perlukan 6 digit IC ${ic ?? 'XXXXXX-XX-XXXX'} terakhir awak untuk pengisian representative jubah ${univ}`;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onPointerDown={(e) => { e.preventDefault(); setDirSheet(null); }}>
            <div className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col overflow-y-auto no-scrollbar"
              onPointerDown={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
              <div className="flex items-center justify-between px-5 pt-2 pb-4">
                <p className="text-sm font-semibold text-slate-700">Representative</p>
                <button onClick={() => setDirSheet(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 flex flex-col gap-4" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
                <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
                  {[
                    { label: 'Representative Name', value: dirSheet.name },
                    { label: 'Drop Point',           value: dirSheet.drop_point || '—' },
                    { label: 'Method',               value: dirSheet.method === 'pickup' ? 'Pickup Only' : 'Pickup & Postage' },
                    { label: 'I/C Number',           value: ic ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-xs font-normal text-slate-400">{label}</span>
                      <span className="text-sm font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal text-slate-400">H/P</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{dirSheet.phone || '—'}</span>
                      {dirSheet.phone && (
                        <a href={`https://wa.me/${toWa(dirSheet.phone)}?text=${encodeURIComponent(waMsg)}`}
                          target="_blank" rel="noopener noreferrer" className="text-[#25D366] active:scale-90 transition shrink-0">
                          <WaIcon className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {jubahSheetRider && (
        <JubahRiderSheet
          rider={jubahSheetRider}
          method={jubahMethodDraft}
          dropPoint={jubahDropPointDraft}
          saving={savingJubahAssignment}
          assignments={jubahAssignments.filter(a => a.rider_id === jubahSheetRider.id)}
          onMethodChange={m => {
            setJubahMethodDraft(m);
            if (m === 'postage') setJubahDropPointDraft('-');
          }}
          onDropPointChange={setJubahDropPointDraft}
          onSave={handleSaveJubahAssignment}
          onAddAssignment={async (method, dropPoint) => {
            const { error } = await supabase.from('jubah_rider_assignments').insert({
              rider_id:   jubahSheetRider.id,
              drop_point: dropPoint,
              method,
              campus:     jubahSheetRider.campus,
              is_active:  true,
            });
            if (error) { showToast('Failed: ' + error.message); return; }
            showToast('Assignment added.');
            loadJubahRiders();
          }}
          onDeleteAssignment={async (id) => {
            const { error } = await supabase.from('jubah_rider_assignments').delete().eq('id', id);
            if (error) { showToast('Failed: ' + error.message); return; }
            showToast('Assignment removed.');
            loadJubahRiders();
          }}
          onClose={() => setJubahSheetRider(null)}
        />
      )}
    </>
  );
});
