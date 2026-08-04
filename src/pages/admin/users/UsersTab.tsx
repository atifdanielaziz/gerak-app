import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  Users, MoreVertical, Car, KeyRound, Bike, GraduationCap, MapPin, ShieldCheck, ShieldOff, Trash2, Truck,
} from 'lucide-react';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { type ProfileUser } from './ProfileSheet';

type PendingAction =
  | { type: 'toggle-status'; u: ProfileUser }
  | { type: 'terminate';     u: ProfileUser }
  | { type: 'toggle-cap';    u: ProfileUser; canDrive: boolean; canRent: boolean; canTransport: boolean }
  | { type: 'toggle-rider-cap'; u: ProfileUser; canDaily: boolean; canRobe: boolean }
  | { type: 'campus';        u: ProfileUser; campus: 'Pekan' | 'Gambang' }
  | { type: 'toggle-role';   u: ProfileUser; newRole: 'driver' | 'admin' }
  | { type: 'toggle-gate-exempt'; u: ProfileUser };

// ── Shared user card ────────────────────────────────────────────────────────
const UserCard: React.FC<{
  u: ProfileUser;
  canManage: boolean;
  togglingStatus: string | null;
  terminating: string | null;
  togglingCap?: string | null;
  togglingCampus?: string | null;
  onToggle: (u: ProfileUser) => void;
  onTerminate: (u: ProfileUser) => void;
  onCapToggle?: (u: ProfileUser, canDrive: boolean, canRent: boolean, canTransport: boolean) => void;
  onRiderCapToggle?: (u: ProfileUser, canDaily: boolean, canRobe: boolean) => void;
  onCampusChange?: (u: ProfileUser, campus: 'Pekan' | 'Gambang') => void;
  onGateToggle?: (u: ProfileUser) => void;
  onRoleToggle?: (u: ProfileUser, newRole: 'driver' | 'admin') => void;
  onViewProfile?: (u: ProfileUser) => void;
}> = ({ u, canManage, togglingStatus, terminating, togglingCap, togglingCampus, onToggle, onTerminate, onCapToggle, onRiderCapToggle, onCampusChange, onGateToggle, onRoleToggle, onViewProfile }) => {
  const [showMenu, setShowMenu] = useState(false);
  const isDriverOrRider = u.role === 'driver' || u.role === 'rider';

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${
      u.status === 'inactive' ? 'bg-red-50/50 border-red-100' : 'bg-white border-slate-100'
    }`}>

      {/* Header row: info + ⋮ menu */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onViewProfile?.(u)}
          className="flex-1 min-w-0 text-left active:opacity-70 transition"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-black text-slate-800 truncate">{u.name}</p>
            <span className={`text-xs font-semibold uppercase shrink-0 ${
              u.role === 'driver'   ? 'text-emerald-600' :
              u.role === 'rider'   ? 'text-amber-600' :
              u.role === 'admin' || u.role === 'superadmin' ? 'text-blue-600' :
              'text-slate-400'
            }`}>{u.role}</span>
            {u.status === 'inactive' && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 uppercase shrink-0">
                Suspended
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">{u.gerak_id} · UMPSA {u.campus}</p>
          <p className="text-xs text-slate-400 truncate">{u.email}</p>
        </button>

        {/* ⋮ vertical dots */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(p => !p)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 active:scale-90 transition"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowMenu(false); }} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[170px]">

                {/* Driver capabilities */}
                {u.role === 'driver' && onCapToggle && (
                  <>
                    <button onClick={() => { onCapToggle(u, !u.can_drive, u.can_rent ?? false, u.can_transport ?? false); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_drive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Car className="w-4 h-4 shrink-0" />
                      {u.can_drive ? 'Car ✓' : 'Car ✗'}
                      {togglingCap === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                    </button>
                    <button onClick={() => { onCapToggle(u, u.can_drive ?? false, !u.can_rent, u.can_transport ?? false); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_rent ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <KeyRound className="w-4 h-4 shrink-0" />
                      {u.can_rent ? 'Rental ✓' : 'Rental ✗'}
                    </button>
                    <button onClick={() => { onCapToggle(u, u.can_drive ?? false, u.can_rent ?? false, !u.can_transport); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_transport ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Truck className="w-4 h-4 shrink-0" />
                      {u.can_transport ? 'Transporter ✓' : 'Transporter ✗'}
                    </button>
                  </>
                )}

                {/* Rider capabilities */}
                {u.role === 'rider' && onRiderCapToggle && (
                  <>
                    <button onClick={() => { onRiderCapToggle(u, !u.can_daily, u.can_robe ?? false); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_daily ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <Bike className="w-4 h-4" />
                      {u.can_daily ? 'Daily ✓' : 'Daily ✗'}
                      {togglingCap === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                    </button>
                    <button onClick={() => { onRiderCapToggle(u, u.can_daily ?? false, !u.can_robe); setShowMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.can_robe ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <GraduationCap className="w-4 h-4" />
                      {u.can_robe ? 'Robe ✓' : 'Robe ✗'}
                    </button>
                  </>
                )}

                {/* Campus toggle */}
                {isDriverOrRider && onCampusChange && (
                  (['Gambang', 'Pekan'] as const).map(c => (
                    <button key={c}
                      onClick={() => { if (u.campus !== c) onCampusChange(u, c); setShowMenu(false); }}
                      disabled={togglingCampus === u.id}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 disabled:opacity-40 ${u.campus === c ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
                      <MapPin className="w-4 h-4 shrink-0" />
                      {c}
                      {u.campus === c && <span className="ml-auto text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">Active</span>}
                      {togglingCampus === u.id && u.campus !== c && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                    </button>
                  ))
                )}

                {/* Gate toggle */}
                {isDriverOrRider && onGateToggle && canManage && (
                  <button onClick={() => { onGateToggle(u); setShowMenu(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold transition active:scale-95 ${u.receipt_gate_exempt ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    {u.receipt_gate_exempt ? 'Gate ✓' : 'Gate ✗'}
                    {togglingCap === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                  </button>
                )}

                {/* Role toggle — superadmin only */}
                {onRoleToggle && isDriverOrRider && (
                  <button onClick={() => { onRoleToggle(u, 'admin'); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition active:scale-95">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    Make Admin
                  </button>
                )}
                {onRoleToggle && u.role === 'admin' && (
                  <button onClick={() => { onRoleToggle(u, 'driver'); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-red-500 hover:bg-red-50 transition active:scale-95">
                    <ShieldOff className="w-4 h-4 shrink-0" />
                    Remove Admin
                  </button>
                )}

                <div className="border-t border-slate-100" />

                {/* WhatsApp smart message */}
                {u.phone && (
                  <a
                    href={(() => {
                      const missing: string[] = [];
                      // Neither drivers nor riders need an IC — only a licence.
                      const isDriverOrRider = u.role === 'driver' || u.role === 'rider';
                      if (!isDriverOrRider && !u.ic_number) missing.push('nombor IC');
                      if (!isDriverOrRider && !u.ic_url)    missing.push('gambar IC');
                      if (isDriverOrRider && !u.license_url) missing.push('gambar lesen memandu');
                      if (!u.matric_no)   missing.push('nombor matrik');
                      if (u.role === 'driver' && !u.vehicle) missing.push('maklumat kenderaan');
                      if (u.status === 'inactive') missing.push('status akaun (hubungi admin)');
                      const body = missing.length > 0
                        ? `Assalamualaikum ${u.name} 👋, admin Gerak di sini.\n\nSila kemaskini maklumat berikut dalam akaun anda:\n${missing.map(m => `• ${m}`).join('\n')}\n\nTerima kasih 🙏`
                        : `Assalamualaikum ${u.name} 👋, admin Gerak di sini. Ada sesuatu yang ingin kami maklumkan. Terima kasih 🙏`;
                      return `https://wa.me/${toWa(u.phone)}?text=${encodeURIComponent(body)}`;
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowMenu(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-[#25D366] hover:bg-green-50 transition active:scale-95"
                  >
                    <WaIcon className="w-4 h-4 shrink-0" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stop + Terminate */}
      {canManage && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onToggle(u)}
            disabled={togglingStatus === u.id}
            className={`flex-1 min-w-0 font-semibold text-xs py-1.5 px-1 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center ${
              u.status === 'active'
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}
          >
            {togglingStatus === u.id
              ? <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
              : u.status === 'active' ? 'Stop' : 'Reactivate'}
          </button>
          <button
            onClick={() => onTerminate(u)}
            disabled={terminating === u.id}
            className="flex-1 min-w-0 bg-red-50 border border-red-200 text-red-600 font-semibold text-xs py-1.5 px-1 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-0.5"
          >
            {terminating === u.id
              ? <span className="w-3 h-3 rounded-full border border-red-400 border-t-transparent animate-spin" />
              : <><Trash2 className="w-3 h-3 shrink-0" /> Terminate</>}
          </button>
        </div>
      )}
    </div>
  );
};

export interface UsersTabHandle {
  reload: () => void;
}

interface UsersTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: 'Pekan' | 'Gambang';
  showToast: (msg: string) => void;
  onViewProfile: (u: ProfileUser) => void;
  onModalOpenChange: (open: boolean) => void;
}

// Staff/driver/rider account management — split out of AdminHome.tsx. The
// profile detail sheet (ProfileSheet) stays at the AdminHome level since the
// Receipts tab also opens it for a driver's receipt row; this component only
// owns the list, the ⋮ action menu, and their own confirm dialog.
export const UsersTab = forwardRef<UsersTabHandle, UsersTabProps>(function UsersTab(
  { active, isSuperAdmin, adminCampus, showToast, onViewProfile, onModalOpenChange },
  ref
) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null)); }, []);

  const [profileUsers, setProfileUsers] = useState<ProfileUser[]>([]);
  // Real total vs profileUsers.length, which is capped at 1000 (see
  // migration_get_all_profiles_cap.sql) — only used to show "showing X of
  // Y" if that cap is ever actually hit.
  const [profileUsersTotalCount, setProfileUsersTotalCount] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [staffSearch, setStaffSearch]   = useState('');
  const [staffFilter, setStaffFilter]   = useState<'all' | 'drivers' | 'riders' | 'admins'>('all');
  // Sub-tab within Staff: the normal manage-everything list, or a lighter
  // read-focused view for spotting who's physically around campus vs away
  // for a stretch (semester break, holiday) — separate from staffFilter,
  // which is about role, not presence.
  const [staffView,   setStaffView]     = useState<'list' | 'campus'>('list');
  const [campusFilter, setCampusFilter] = useState<'in_campus' | 'out_campus'>('in_campus');
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);
  const [terminating, setTerminating]       = useState<string | null>(null);
  const [togglingCap, setTogglingCap]       = useState<string | null>(null);
  const [togglingCampus, setTogglingCampus] = useState<string | null>(null);
  const [pendingAction, setPendingAction]   = useState<PendingAction | null>(null);

  useEffect(() => { onModalOpenChange(!!pendingAction); }, [pendingAction, onModalOpenChange]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    // Campus scoping now happens server-side (get_all_profiles(p_campus)) —
    // previously fetched every admin/driver/rider in the whole system and
    // threw most of it away here, which also meant the three capability
    // lookups below scaled with the unfiltered total instead of just this
    // campus's users.
    let countQ = supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'driver', 'rider']);
    if (!isSuperAdmin) countQ = countQ.eq('campus', adminCampus);
    const [{ data }, { count }] = await Promise.all([
      supabase.rpc('get_all_profiles', { p_campus: isSuperAdmin ? null : adminCampus }),
      countQ,
    ]);
    setProfileUsersTotalCount(count ?? null);
    // Enrich drivers with capability flags from profiles table
    const users = (data as ProfileUser[]) ?? [];
    const driverIds      = users.filter(u => u.role === 'driver').map(u => u.id);
    const riderIds       = users.filter(u => u.role === 'rider').map(u => u.id);
    const driverRiderIds = [...driverIds, ...riderIds];

    // Three independent lookups — fire together instead of awaiting one at a time.
    const [{ data: driverCaps }, { data: riderCaps }, { data: exempts }] = await Promise.all([
      driverIds.length > 0
        ? supabase.from('profiles').select('id, can_drive, can_rent, can_transport').in('id', driverIds)
        : Promise.resolve({ data: null }),
      riderIds.length > 0
        ? supabase.from('profiles').select('id, can_daily, can_robe').in('id', riderIds)
        : Promise.resolve({ data: null }),
      driverRiderIds.length > 0
        ? supabase.from('profiles').select('id, receipt_gate_exempt').in('id', driverRiderIds)
        : Promise.resolve({ data: null }),
    ]);

    const usersById = new Map(users.map(u => [u.id, u]));
    driverCaps?.forEach(c => {
      const u = usersById.get(c.id);
      if (u) { u.can_drive = c.can_drive; u.can_rent = c.can_rent; u.can_transport = c.can_transport; }
    });
    riderCaps?.forEach(c => {
      const u = usersById.get(c.id);
      if (u) { u.can_daily = c.can_daily; u.can_robe = c.can_robe; }
    });
    exempts?.forEach(c => {
      const u = usersById.get(c.id);
      if (u) { u.receipt_gate_exempt = c.receipt_gate_exempt; }
    });
    setProfileUsers(users);
    setUsersLoading(false);
  }, [isSuperAdmin, adminCampus]);

  useLoadOnActive(active, loadUsers);
  useImperativeHandle(ref, () => ({ reload: loadUsers }), [loadUsers]);

  const handleToggleCapability = async (u: ProfileUser, canDrive: boolean, canRent: boolean, canTransport: boolean) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { showToast('Session expired — please log in again.'); return; }
    setTogglingCap(u.id);
    const { error } = await supabase.rpc('set_driver_capabilities', {
      p_user_id:  u.id,
      p_can_drive: canDrive,
      p_can_rent:  canRent,
      p_can_transport: canTransport,
    });
    setTogglingCap(null);
    if (error) showToast('Failed to update capabilities.');
    else {
      showToast(`${u.name}: ${canDrive ? 'Car ✓' : 'Car ✗'} · ${canRent ? 'Rental ✓' : 'Rental ✗'} · ${canTransport ? 'Transporter ✓' : 'Transporter ✗'}`);
      loadUsers();
    }
  };

  const handleToggleRiderCapability = async (u: ProfileUser, canDaily: boolean, canRobe: boolean) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { showToast('Session expired — please log in again.'); return; }
    setTogglingCap(u.id);
    const { error } = await supabase.rpc('set_rider_capabilities', {
      p_user_id:  u.id,
      p_can_daily: canDaily,
      p_can_robe:  canRobe,
    });
    setTogglingCap(null);
    if (error) showToast('Failed to update capabilities.');
    else {
      showToast(`${u.name}: ${canDaily ? 'Daily ✓' : 'Daily ✗'} · ${canRobe ? 'Robe ✓' : 'Robe ✗'}`);
      loadUsers();
    }
  };

  const handleToggleReceiptGateExempt = async (u: ProfileUser) => {
    setTogglingCap(u.id);
    const newExempt = !u.receipt_gate_exempt;
    const { error } = await supabase.rpc('set_receipt_gate_exempt', {
      p_user_id: u.id,
      p_exempt:  newExempt,
    });
    setTogglingCap(null);
    if (error) showToast('Failed to update gate exemption.');
    else {
      showToast(`${u.name}: Gate ${newExempt ? 'Exempted' : 'Enforced'}.`);
      loadUsers();
    }
  };

  const handleChangeCampus = async (u: ProfileUser, campus: 'Pekan' | 'Gambang') => {
    setTogglingCampus(u.id);
    const { error } = await supabase.rpc('set_driver_campus', {
      p_user_id: u.id,
      p_campus:  campus,
    });
    setTogglingCampus(null);
    if (error) showToast('Failed to update campus.');
    else { showToast(`${u.name} moved to UMPSA ${campus}.`); loadUsers(); }
  };

  const handleToggleRole = async (u: ProfileUser, newRole: 'driver' | 'admin') => {
    const { error } = await supabase.rpc('toggle_user_role', { p_target_id: u.id, p_new_role: newRole });
    if (error) showToast('Failed to change role.');
    else { showToast(`${u.name} is now ${newRole === 'admin' ? 'Admin + Driver' : 'Driver only'}.`); loadUsers(); }
  };

  const handleToggleStatus = async (u: ProfileUser) => {
    setTogglingStatus(u.id);
    const newStatus = u.status === 'active' ? 'inactive' : 'active';
    const { data } = await supabase.rpc('set_user_status', { p_user_id: u.id, p_status: newStatus });
    setTogglingStatus(null);
    if (data?.success === false) showToast(data.error ?? 'Failed');
    else { showToast(newStatus === 'inactive' ? `${u.name} suspended.` : `${u.name} reactivated.`); loadUsers(); }
  };

  const handleTerminate = async (u: ProfileUser) => {
    if (!confirm(`Permanently terminate ${u.name} (${u.gerak_id})? This cannot be undone.`)) return;
    setTerminating(u.id);
    const { data } = await supabase.rpc('terminate_user', { p_user_id: u.id });
    setTerminating(null);
    if (data?.success === false) showToast(data.error ?? 'Failed');
    else { showToast(`${u.name} has been terminated.`); loadUsers(); }
  };

  const executePendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'toggle-status') handleToggleStatus(pendingAction.u);
    else if (pendingAction.type === 'terminate')  handleTerminate(pendingAction.u);
    else if (pendingAction.type === 'toggle-cap') handleToggleCapability(pendingAction.u, pendingAction.canDrive, pendingAction.canRent, pendingAction.canTransport);
    else if (pendingAction.type === 'toggle-rider-cap') handleToggleRiderCapability(pendingAction.u, pendingAction.canDaily, pendingAction.canRobe);
    else if (pendingAction.type === 'campus')     handleChangeCampus(pendingAction.u, pendingAction.campus);
    else if (pendingAction.type === 'toggle-role') handleToggleRole(pendingAction.u, pendingAction.newRole);
    else if (pendingAction.type === 'toggle-gate-exempt') handleToggleReceiptGateExempt(pendingAction.u);
    setPendingAction(null);
  };

  const canManage = (targetRole: string, targetId: string) => {
    if (targetId === myUserId) return false;
    if (isSuperAdmin) return true;
    return !['admin', 'superadmin'].includes(targetRole);
  };

  // Was recomputed raw in the render body on every render, so every
  // keystroke into the search box re-filtered the full list synchronously.
  const filteredUsers = useMemo(() => {
    return profileUsers.filter(u => {
      const roleMatch =
        staffFilter === 'all'     ? true :
        staffFilter === 'drivers' ? u.role === 'driver' :
        staffFilter === 'riders'  ? u.role === 'rider' :
        ['admin', 'superadmin'].includes(u.role);
      if (!roleMatch) return false;
      if (!staffSearch.trim()) return true;
      const q = staffSearch.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.gerak_id?.toLowerCase().includes(q);
    });
  }, [profileUsers, staffFilter, staffSearch]);

  const campusFilteredUsers = useMemo(() => {
    return profileUsers.filter(u => (u.campus_status ?? 'in_campus') === campusFilter);
  }, [profileUsers, campusFilter]);

  return (
    <>
      <div className="flex flex-col gap-4">

        {/* Admins & Drivers list */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Admins and Staff
          </h3>

          {/* Role filter + In/Out — one combined row. In/Out switches the
              whole view (staffView), the other four stay within the normal
              staff list (staffView='list' + staffFilter). */}
          <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
            {([
              { id: 'all',     label: 'All' },
              { id: 'drivers', label: 'Drivers' },
              { id: 'riders',  label: 'Riders' },
              { id: 'admins',  label: 'Admins' },
              { id: 'campus',  label: 'In/Out' },
            ] as const).map(f => {
              const isActive = f.id === 'campus' ? staffView === 'campus' : (staffView === 'list' && staffFilter === f.id);
              return (
                <button key={f.id} onPointerDown={e => {
                  e.preventDefault();
                  if (f.id === 'campus') setStaffView('campus');
                  else { setStaffView('list'); setStaffFilter(f.id); }
                }}
                  className="relative shrink-0 rounded-xl transition-transform transform-gpu active:scale-95">
                  <span className="block px-4 py-1.5 text-xs font-semibold text-slate-400 whitespace-nowrap">{f.label}</span>
                  <span className={`absolute inset-0 flex items-center justify-center px-4 py-1.5 rounded-xl bg-white text-slate-800 text-xs font-semibold whitespace-nowrap transition-opacity duration-150 ${
                    isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}>
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>

          {staffView === 'campus' ? (
            <>
              {/* In/Out Campus filter — same opacity-overlay pill technique
                  as every other toggle in this app. */}
              <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1">
                {([
                  { id: 'in_campus',  label: 'In Campus' },
                  { id: 'out_campus', label: 'Out Campus' },
                ] as const).map(f => (
                  <button key={f.id} onPointerDown={e => { e.preventDefault(); setCampusFilter(f.id); }}
                    className="relative flex-1 rounded-xl transition-transform transform-gpu active:scale-95">
                    <span className="block px-2 py-1.5 text-xs font-semibold text-slate-400 text-center whitespace-nowrap">{f.label}</span>
                    <span className={`absolute inset-0 flex items-center justify-center px-2 py-1.5 rounded-xl bg-white text-slate-800 text-xs font-semibold whitespace-nowrap transition-opacity duration-150 ${
                      campusFilter === f.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}>
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto no-scrollbar max-h-[420px] flex flex-col gap-2">
                {usersLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
                  </div>
                ) : campusFilteredUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No staff found</p>
                ) : (
                  campusFilteredUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => onViewProfile(u)}
                      className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 active:bg-slate-50 transition text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{u.name}</p>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5 capitalize">{u.role} · {u.gerak_id}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        (u.campus_status ?? 'in_campus') === 'in_campus'
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}>
                        {(u.campus_status ?? 'in_campus') === 'in_campus' ? 'In Campus' : 'Out of Campus'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (<>
          {/* Search input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              placeholder="Name or Gerak ID"
              style={{ fontSize: '12px' }}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal placeholder:text-slate-400"
            />
            <button
              onClick={() => setStaffSearch('')}
              disabled={!staffSearch.trim()}
              className="px-3.5 bg-primary text-white font-semibold text-xs rounded-xl transition active:scale-95 disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {profileUsersTotalCount !== null && profileUsersTotalCount > profileUsers.length && (
            <p className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Showing {profileUsers.length} of {profileUsersTotalCount} staff — use search to find someone else.
            </p>
          )}

          <div className="overflow-y-auto no-scrollbar max-h-[420px] flex flex-col gap-2">
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : (() => {
              const filtered = filteredUsers;
              return filtered.length === 0
                ? <p className="text-xs text-slate-400 text-center py-4">No {staffFilter === 'all' ? 'staff' : staffFilter} found</p>
                : (
                  <div className="flex flex-col gap-2">
                    {filtered.map(u => (
                      <UserCard key={u.id} u={u} canManage={canManage(u.role, u.id)}
                        togglingStatus={togglingStatus} terminating={terminating}
                        togglingCap={togglingCap} togglingCampus={togglingCampus}
                        onToggle={u => setPendingAction({ type: 'toggle-status', u })}
                        onTerminate={u => setPendingAction({ type: 'terminate', u })}
                        onCapToggle={isSuperAdmin ? (u, canDrive, canRent, canTransport) => setPendingAction({ type: 'toggle-cap', u, canDrive, canRent, canTransport }) : undefined}
                        onRiderCapToggle={isSuperAdmin ? (u, canDaily, canRobe) => setPendingAction({ type: 'toggle-rider-cap', u, canDaily, canRobe }) : undefined}
                        onCampusChange={isSuperAdmin ? (u, campus) => setPendingAction({ type: 'campus', u, campus }) : undefined}
                        onGateToggle={isSuperAdmin ? (u => setPendingAction({ type: 'toggle-gate-exempt', u })) : undefined}
                        onRoleToggle={isSuperAdmin ? (u, newRole) => setPendingAction({ type: 'toggle-role', u, newRole }) : undefined}
                        onViewProfile={onViewProfile} />
                    ))}
                  </div>
                );
            })()}
          </div>
          </>)}
        </div>
      </div>

      {pendingAction && (() => {
        const { u } = pendingAction;
        const isTerminate = pendingAction.type === 'terminate';
        const isStop = pendingAction.type === 'toggle-status' && u.status === 'active';

        const isRoleToAdmin = pendingAction.type === 'toggle-role' && pendingAction.newRole === 'admin';

        const title =
          pendingAction.type === 'terminate'     ? `Terminate ${u.name}?` :
          pendingAction.type === 'toggle-status' ? (isStop ? `Suspend ${u.name}?` : `Reactivate ${u.name}?`) :
          pendingAction.type === 'toggle-cap'    ? `Update capabilities for ${u.name}?` :
          pendingAction.type === 'toggle-rider-cap' ? `Update capabilities for ${u.name}?` :
          pendingAction.type === 'toggle-role'   ? (isRoleToAdmin ? `Promote ${u.name} to Admin?` : `Change ${u.name} to Driver?`) :
          pendingAction.type === 'toggle-gate-exempt' ? (u.receipt_gate_exempt ? `Remove gate exemption for ${u.name}?` : `Exempt ${u.name} from receipt gate?`) :
          `Move ${u.name} to UMPSA ${(pendingAction as { campus: string }).campus}?`;

        const desc =
          isTerminate  ? 'This will permanently remove their account. This cannot be undone.' :
          isStop       ? 'They will lose access to the app until reactivated.' :
          pendingAction.type === 'toggle-status' ? 'They will regain access to the app.' :
          pendingAction.type === 'toggle-cap'    ? 'Their service capabilities will be updated immediately.' :
          pendingAction.type === 'toggle-rider-cap' ? 'Their service capabilities will be updated immediately.' :
          pendingAction.type === 'toggle-role'   ? (isRoleToAdmin ? 'They will gain Admin panel access + full driving capabilities.' : 'They will lose Admin panel access and become a driver only.') :
          pendingAction.type === 'toggle-gate-exempt' ? (u.receipt_gate_exempt ? 'They will need a valid monthly receipt again to stay active.' : 'They will bypass the monthly receipt requirement and stay active regardless.') :
          'Their campus assignment will change immediately.';

        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
            onPointerDown={(e) => { e.preventDefault(); setPendingAction(null); }}>
            <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
              onPointerDown={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
              <div className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
                isTerminate ? 'bg-red-100' : isStop ? 'bg-amber-100' : 'bg-primary/10'
              }`}>
                {isTerminate
                  ? <Trash2 className="w-5 h-5 text-red-500" />
                  : isStop
                    ? <span className="text-amber-600 font-black text-sm">✕</span>
                    : <span className="text-primary font-black text-sm">✓</span>}
              </div>
              <h3 className="text-sm font-black text-slate-800 text-center mb-1">{title}</h3>
              <p className="text-xs text-slate-400 font-semibold text-center mb-6">{desc}</p>
              <div className="flex gap-3">
                <button onClick={() => setPendingAction(null)}
                  className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95">
                  Cancel
                </button>
                <button onClick={executePendingAction}
                  className={`flex-1 font-semibold text-xs py-3 rounded-2xl transition active:scale-95 text-white ${
                    isTerminate ? 'bg-red-500' : isStop ? 'bg-amber-500' : 'bg-primary'
                  }`}>
                  Yes, Confirm
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
});
