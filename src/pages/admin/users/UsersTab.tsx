import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import {
  Users, MoreVertical, Car, KeyRound, Bike, GraduationCap, MapPin, ShieldCheck, ShieldOff, Trash2, Truck, FileCheck2,
  BarChart3, CalendarCheck2, CalendarX2, UserCheck, LogIn, LogOut, Wifi, BriefcaseBusiness, PauseCircle, PlayCircle, ChevronDown,
  Crown,
} from 'lucide-react';
import { WaIcon, toWa } from '../../../lib/whatsapp';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { type ProfileUser } from './ProfileSheet';
import { NativeSelect } from '../../../components/NativeSelect';
import { UNIVERSITIES, UNIVERSITY_MAP, jubahLocationLabel, universityKeyFromCampus } from '../../../lib/universities';
import { DocumentVerificationSheet } from '../verify/DocumentVerificationSheet';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';

type PendingAction =
  | { type: 'toggle-status'; u: ProfileUser }
  | { type: 'terminate';     u: ProfileUser }
  | { type: 'toggle-cap';    u: ProfileUser; canDrive: boolean; canRent: boolean; canTransport: boolean }
  | { type: 'toggle-rider-cap'; u: ProfileUser; canDaily: boolean; canRobe: boolean }
  | { type: 'campus';        u: ProfileUser }
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
  onCampusChange?: (u: ProfileUser) => void;
  onGateToggle?: (u: ProfileUser) => void;
  onRoleToggle?: (u: ProfileUser, newRole: 'driver' | 'admin') => void;
  onViewProfile?: (u: ProfileUser) => void;
  onVerifyDocuments?: (u: ProfileUser) => void;
  isOnline: boolean;
}> = ({ u, canManage, togglingStatus, terminating, togglingCap, togglingCampus, onToggle, onTerminate, onCapToggle, onRiderCapToggle, onCampusChange, onGateToggle, onRoleToggle, onViewProfile, onVerifyDocuments, isOnline }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const isDriverLike = u.role === 'driver' || u.role === 'admin';
  const isDriverOrRider = isDriverLike || u.role === 'rider';
  // University/campus reassignment is now open to admin cards too (not
  // just driver/rider) — separate from isDriverOrRider since that gate is
  // still used below for capability/gate/role-toggle menu items, which
  // stay role-specific.
  const canChangeCampus = isDriverOrRider || u.role === 'admin';

  return (
    <div onClick={() => onViewProfile?.(u)} className={`grid grid-cols-[minmax(12rem,1.5fr)_6rem_7rem_8rem_minmax(14rem,1.5fr)_7rem_5.5rem_7rem_2.5rem] items-center min-w-[76rem] cursor-pointer border-b border-slate-100 last:border-b-0 ${
      u.status === 'inactive' ? 'bg-red-50/50' : 'bg-white'
    }`}>

      {/* Header row: info + ⋮ menu */}
      <div className="contents">
        <button
          type="button"
          className="min-w-0 text-left px-3 py-3 active:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-slate-800 truncate">{u.name}</p>
            {u.status === 'inactive' && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 uppercase shrink-0">
                Suspended
              </span>
            )}
          </div>
        </button>

        <div className="px-3 py-3 text-xs font-normal text-slate-600 capitalize">{u.role}</div>
        <div className="px-3 py-3 text-xs font-normal text-slate-600">{u.gerak_id}</div>
        <div className="px-3 py-3 text-xs font-normal text-slate-600">{jubahLocationLabel(universityKeyFromCampus(u.campus) ?? '', u.campus)}</div>
        <div className="px-3 py-3 text-xs font-normal text-slate-600 truncate" title={u.email}>{u.email}</div>
        <div className="px-3 py-3 text-xs font-normal text-slate-600">{(u.campus_status ?? 'in_campus') === 'in_campus' ? 'In Campus' : 'Out Campus'}</div>
        <div className={`px-3 py-3 text-xs font-semibold ${isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>{isOnline ? 'Online' : 'Offline'}</div>
        <div className="px-3 py-3 text-xs font-normal text-slate-600">{isDriverOrRider ? (u.has_active_job ? 'Taking Job' : 'Available') : '—'}</div>

        {/* ⋮ vertical dots */}
        <div data-axis-lock-ignore className="relative shrink-0 px-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              // Keep the five-row viewport fully on-screen. The menu itself is
              // portalled below so the table's axis-lock gesture cannot trap
              // the remaining actions below the visible rows.
              setMenuPosition({ top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 256)), right: Math.max(8, window.innerWidth - rect.right) });
              setShowMenu(p => !p);
            }}
            onClick={e => e.stopPropagation()}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 active:scale-90 transition"
            aria-label={`Actions for ${u.name}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); }} />
              <div
                data-axis-lock-ignore
                onClick={e => e.stopPropagation()}
                className="fixed z-[9999] min-w-[190px] max-h-[15rem] overflow-y-auto overscroll-contain touch-pan-y bg-white border border-slate-100 rounded-2xl shadow-xl pointer-events-auto [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
                style={{ top: menuPosition.top, right: menuPosition.right }}>

                {/* Driver capabilities */}
                {isDriverLike && onCapToggle && (
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

                {/* Campus/university reassignment — opens a picker sheet
                    rather than listing every one of the 12 campuses inline
                    here, which stopped scaling once campus assignment grew
                    beyond UMPSA's 2 options. */}
                {canChangeCampus && onCampusChange && (
                  <button
                    onClick={() => { onCampusChange(u); setShowMenu(false); }}
                    disabled={togglingCampus === u.id}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50 transition active:scale-95 disabled:opacity-40">
                    <MapPin className="w-4 h-4 shrink-0" />
                    Change Campus
                    {togglingCampus === u.id && <span className="ml-auto w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />}
                  </button>
                )}

                {isDriverOrRider && onVerifyDocuments && (
                  <button type="button"
                    onPointerDown={e => { e.preventDefault(); onVerifyDocuments(u); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-slate-600 active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu">
                    <FileCheck2 className="w-4 h-4 shrink-0 text-slate-400" />
                    Verify Documents
                  </button>
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
                {onRoleToggle && (u.role === 'driver' || u.role === 'rider') && (
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

                {canManage && (
                  <>
                    <button type="button" onClick={() => { onToggle(u); setShowMenu(false); }} disabled={togglingStatus === u.id}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-40">
                      {u.status === 'active' ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      {u.status === 'active' ? 'Stop' : 'Reactivate'}
                    </button>
                    <button type="button" onClick={() => { onTerminate(u); setShowMenu(false); }} disabled={terminating === u.id}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-semibold text-red-600 active:bg-slate-50 disabled:opacity-40">
                      <Trash2 className="w-4 h-4" /> Terminate
                    </button>
                    <div className="border-t border-slate-100" />
                  </>
                )}

                {/* WhatsApp smart message */}
                {u.phone && (
                  <a
                    href={(() => {
                      const missing: string[] = [];
                      // Neither drivers nor riders need an IC — only a licence.
                      const isDriverOrRider = u.role === 'driver' || u.role === 'rider' || u.role === 'admin';
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
            </>,
            document.body
          )}
        </div>
      </div>

    </div>
  );
};

export interface UsersTabHandle {
  reload: () => void;
}

interface UsersTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: string;
  universityKey: string;
  showToast: (msg: string) => void;
  onViewProfile: (u: ProfileUser) => void;
  onModalOpenChange: (open: boolean) => void;
}

// Staff/driver/rider account management — split out of AdminHome.tsx. The
// profile detail sheet (ProfileSheet) stays at the AdminHome level since the
// Receipts tab also opens it for a driver's receipt row; this component only
// owns the list, the ⋮ action menu, and their own confirm dialog.
export const UsersTab = forwardRef<UsersTabHandle, UsersTabProps>(function UsersTab(
  { active, isSuperAdmin, adminCampus, universityKey, showToast, onViewProfile, onModalOpenChange },
  ref
) {
  const staffDirectoryScrollRef = useAxisLockedScroll<HTMLDivElement>();
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
  const [overviewFilter, setOverviewFilter] = useState<'all' | 'payment_valid' | 'expired' | 'active_drivers' | 'in_campus' | 'out_campus' | 'online' | 'taking_job'>('all');
  const [overviewCollapsed, setOverviewCollapsed] = useState(true);
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
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);
  // Picker state for the 'campus' pendingAction — pre-filled to the
  // target user's current university/campus when the sheet opens, chosen
  // live in the sheet rather than fixed at the moment the ⋮ menu item
  // was tapped (there are 12 campuses now, too many for inline buttons).
  const [campusPickerUniversity, setCampusPickerUniversity] = useState('');
  const [campusPickerCampus, setCampusPickerCampus]         = useState('');
  const [leadUserId, setLeadUserId] = useState('');
  const [leadUniversityKeys, setLeadUniversityKeys] = useState<string[]>([]);
  const [runnerUserId, setRunnerUserId] = useState('');
  const [runnerLeadId, setRunnerLeadId] = useState('');
  const [runnerUniversityKey, setRunnerUniversityKey] = useState('');
  const [leadRows, setLeadRows] = useState<Array<{ user_id: string; is_active: boolean }>>([]);
  const [leadAssignments, setLeadAssignments] = useState<Array<{ lead_id: string; university_key: string }>>([]);
  const [savingLead, setSavingLead] = useState(false);

  useEffect(() => { onModalOpenChange(!!pendingAction || !!reviewingUserId); }, [pendingAction, reviewingUserId, onModalOpenChange]);

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
    const [{ data: driverCaps }, { data: riderCaps }, { data: exempts }, { data: presence }, { data: rideJobs }, { data: jubahJobs }] = await Promise.all([
      driverIds.length > 0
        ? supabase.from('profiles').select('id, can_drive, can_rent, can_transport').in('id', driverIds)
        : Promise.resolve({ data: null }),
      riderIds.length > 0
        ? supabase.from('profiles').select('id, can_daily, can_robe').in('id', riderIds)
        : Promise.resolve({ data: null }),
      driverRiderIds.length > 0
        ? supabase.from('profiles').select('id, receipt_gate_exempt').in('id', driverRiderIds)
        : Promise.resolve({ data: null }),
      users.length > 0
        ? supabase.from('profiles').select('id, last_seen_at').in('id', users.map(u => u.id))
        : Promise.resolve({ data: null }),
      driverIds.length > 0
        ? supabase.from('ride_orders').select('driver_id').in('driver_id', driverIds).in('status', ['accepted', 'in_progress'])
        : Promise.resolve({ data: null }),
      riderIds.length > 0
        ? supabase.from('jubah_bookings').select('rider_id,status,payment_mode').in('rider_id', riderIds).not('status', 'in', '(ordered,cancelled,delivered,at_hub)')
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
    presence?.forEach(p => { const u = usersById.get(p.id); if (u) u.last_seen_at = p.last_seen_at; });
    const busyIds = new Set<string>([
      ...(rideJobs ?? []).map(j => j.driver_id).filter(Boolean),
      ...(jubahJobs ?? []).map(j => j.rider_id).filter(Boolean),
    ] as string[]);
    users.forEach(u => { u.has_active_job = busyIds.has(u.id); });
    setProfileUsers(users);
    if (isSuperAdmin) {
      const [{ data: leads }, { data: assignments }] = await Promise.all([
        supabase.from('jubah_leads').select('user_id,is_active'),
        supabase.from('jubah_lead_universities').select('lead_id,university_key'),
      ]);
      setLeadRows((leads ?? []) as Array<{ user_id: string; is_active: boolean }>);
      setLeadAssignments((assignments ?? []) as Array<{ lead_id: string; university_key: string }>);
    }
    setUsersLoading(false);
  }, [isSuperAdmin, adminCampus]);

  useLoadOnActive(active, loadUsers);
  useImperativeHandle(ref, () => ({ reload: loadUsers }), [loadUsers]);

  const saveJubahLead = async () => {
    if (!leadUserId || leadUniversityKeys.length === 0) return showToast('Select a staff member and at least one university.');
    setSavingLead(true);
    const { data, error } = await supabase.rpc('set_jubah_lead', {
      p_user_id: leadUserId,
      p_university_keys: leadUniversityKeys,
      p_active: true,
    });
    setSavingLead(false);
    if (error) return showToast(error.message);
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) return showToast(result?.error ?? 'Could not save the Jubah Lead.');
    showToast('Jubah Lead assignment saved.');
    await loadUsers();
  };

  const removeJubahLead = async () => {
    if (!leadUserId) return;
    setSavingLead(true);
    const { data, error } = await supabase.rpc('set_jubah_lead', {
      p_user_id: leadUserId,
      p_university_keys: [],
      p_active: false,
    });
    setSavingLead(false);
    if (error) return showToast(error.message);
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) return showToast(result?.error ?? 'Could not remove the Jubah Lead.');
    setLeadUniversityKeys([]);
    showToast('Jubah Lead access removed.');
    await loadUsers();
  };

  const saveRunnerLead = async () => {
    if (!runnerUserId || !runnerLeadId || !runnerUniversityKey) return showToast('Select a runner, Lead and university.');
    setSavingLead(true);
    const { data, error } = await supabase.rpc('assign_jubah_runner_to_lead', {
      p_runner_id: runnerUserId,
      p_lead_id: runnerLeadId,
      p_university_key: runnerUniversityKey,
    });
    setSavingLead(false);
    if (error) return showToast(error.message);
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) return showToast(result?.error ?? 'Could not assign the Jubah runner.');
    showToast('Jubah runner assigned to the Lead.');
  };

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

  const handleChangeCampus = async (u: ProfileUser, universityKey: string, campus: string) => {
    setTogglingCampus(u.id);
    const { error } = await supabase.rpc('set_driver_campus', {
      p_user_id:    u.id,
      p_university: UNIVERSITY_MAP[universityKey]?.fullName ?? '',
      p_campus:     campus,
    });
    setTogglingCampus(null);
    if (error) showToast('Failed to update campus.');
    else { showToast(`${u.name} moved to ${jubahLocationLabel(universityKey, campus)}.`); loadUsers(); }
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
    else if (pendingAction.type === 'campus')     handleChangeCampus(pendingAction.u, campusPickerUniversity, campusPickerCampus);
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
  const universityUsers = useMemo(() => profileUsers.filter(u =>
    (universityKeyFromCampus(u.campus) ?? 'umpsa') === universityKey
  ), [profileUsers, universityKey]);

  const filteredUsers = useMemo(() => {
    const now = Date.now();
    return universityUsers.filter(u => {
      const roleMatch =
        staffFilter === 'all'     ? true :
        staffFilter === 'drivers' ? u.role === 'driver' :
        staffFilter === 'riders'  ? u.role === 'rider' :
        ['admin', 'superadmin'].includes(u.role);
      if (!roleMatch) return false;
      const overviewMatch =
        overviewFilter === 'all' ? true :
        overviewFilter === 'payment_valid' ? !!(u.receipt_gate_exempt || (u.fee_receipt_verified && u.fee_receipt_expiry && new Date(u.fee_receipt_expiry).getTime() >= now)) :
        overviewFilter === 'expired' ? !!(!u.receipt_gate_exempt && u.fee_receipt_expiry && new Date(u.fee_receipt_expiry).getTime() < now) :
        overviewFilter === 'active_drivers' ? u.role === 'driver' && u.status === 'active' && u.docs_status === 'approved' && !!u.can_drive && !!(u.receipt_gate_exempt || (u.fee_receipt_verified && u.fee_receipt_expiry && new Date(u.fee_receipt_expiry).getTime() >= now)) :
        overviewFilter === 'in_campus' ? (u.campus_status ?? 'in_campus') === 'in_campus' :
        overviewFilter === 'out_campus' ? u.campus_status === 'out_campus' :
        overviewFilter === 'online' ? !!u.last_seen_at && now - new Date(u.last_seen_at).getTime() <= 300_000 :
        !!u.has_active_job;
      if (!overviewMatch) return false;
      if (!staffSearch.trim()) return true;
      const q = staffSearch.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.gerak_id?.toLowerCase().includes(q);
    });
  }, [universityUsers, staffFilter, overviewFilter, staffSearch]);

  const overview = useMemo(() => {
    const now = Date.now();
    const roleUsers = universityUsers.filter(u =>
      staffFilter === 'all' ? true :
      staffFilter === 'drivers' ? u.role === 'driver' :
      staffFilter === 'riders' ? u.role === 'rider' :
      ['admin', 'superadmin'].includes(u.role)
    );
    const paymentStaff = roleUsers.filter(u => u.role === 'driver' || u.role === 'rider');
    const paymentValid = paymentStaff.filter(u => u.receipt_gate_exempt || (u.fee_receipt_verified && u.fee_receipt_expiry && new Date(u.fee_receipt_expiry).getTime() >= now)).length;
    const expired = paymentStaff.filter(u => !u.receipt_gate_exempt && !!u.fee_receipt_expiry && new Date(u.fee_receipt_expiry).getTime() < now).length;
    return {
      paymentValid,
      expired,
      activeDrivers: roleUsers.filter(u => u.role === 'driver' && u.status === 'active' && u.docs_status === 'approved' && !!u.can_drive && (u.receipt_gate_exempt || (u.fee_receipt_verified && !!u.fee_receipt_expiry && new Date(u.fee_receipt_expiry).getTime() >= now))).length,
      inCampus: roleUsers.filter(u => (u.campus_status ?? 'in_campus') === 'in_campus').length,
      outCampus: roleUsers.filter(u => u.campus_status === 'out_campus').length,
      online: roleUsers.filter(u => !!u.last_seen_at && now - new Date(u.last_seen_at).getTime() <= 300_000).length,
      takingJob: roleUsers.filter(u => u.has_active_job).length,
      total: roleUsers.length,
    };
  }, [universityUsers, staffFilter]);

  const campusFilteredUsers = useMemo(() => {
    return profileUsers.filter(u => {
      if ((u.campus_status ?? 'in_campus') !== campusFilter) return false;
      if (!staffSearch.trim()) return true;
      const q = staffSearch.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.gerak_id?.toLowerCase().includes(q);
    });
  }, [profileUsers, campusFilter, staffSearch]);

  return (
    <>
      <div className="flex flex-col gap-4 w-full">

        <section className={`bg-white border border-slate-100 rounded-3xl ${overviewCollapsed ? 'p-3.5' : 'p-4'}`}>
          <button type="button" onPointerDown={e => { e.preventDefault(); setOverviewCollapsed(value => !value); }}
            className={`w-full flex items-center justify-between gap-3 active:scale-[0.99] transition-transform transform-gpu ${overviewCollapsed ? '' : 'mb-4'}`}
            aria-label={overviewCollapsed ? 'Show staff overview stats' : 'Hide staff overview stats'}>
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-400" /> Staff Overview ({UNIVERSITY_MAP[universityKey]?.shortLabel})
            </h3>
            <span className="flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-600 text-xs font-bold px-3 py-1.5 rounded-full shrink-0">
              {overviewCollapsed ? 'View Stats' : 'Hide Stats'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${overviewCollapsed ? '' : 'rotate-180'}`} />
            </span>
          </button>
          {!overviewCollapsed && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              ['Payment Valid', overview.paymentValid, CalendarCheck2, 'bg-emerald-50', 'text-emerald-600'],
              ['Expired', overview.expired, CalendarX2, 'bg-red-50', 'text-red-500'],
              ['Active Drivers', overview.activeDrivers, UserCheck, 'bg-blue-50', 'text-blue-600'],
              ['In Campus', overview.inCampus, LogIn, 'bg-violet-50', 'text-violet-600'],
              ['Out Campus', overview.outCampus, LogOut, 'bg-amber-50', 'text-amber-600'],
              ['Online', overview.online, Wifi, 'bg-cyan-50', 'text-cyan-600'],
              ['Taking Job', overview.takingJob, BriefcaseBusiness, 'bg-indigo-50', 'text-indigo-600'],
              ['Total Staff', overview.total, Users, 'bg-slate-100', 'text-slate-600'],
            ] as const).map(([label, value, Icon, iconBg, iconColor]) => (
              <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <p className="text-xs font-normal text-slate-400">{label}</p>
                <p className="text-xl font-semibold text-slate-800 mt-1">{value}</p>
              </div>
            ))}
          </div>}
        </section>

        {/* Admins & Drivers list */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4 w-full">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Admins and Staff
          </h3>

          {/* Role filter + In/Out — one combined row. In/Out switches the
              whole view (staffView), the other four stay within the normal
              staff list (staffView='list' + staffFilter). */}
          <div className="hidden">
            {([
              { id: 'all',     label: 'All' },
              { id: 'drivers', label: 'Drivers' },
              { id: 'riders',  label: 'Riders' },
              { id: 'admins',  label: 'Admins' },
            ] as const).map(f => {
              const isActive = staffView === 'list' && staffFilter === f.id;
              return (
                <button key={f.id} onPointerDown={e => {
                  e.preventDefault();
                  setStaffView('list');
                  setStaffFilter(f.id);
                }}
                  className="relative flex-1 min-w-0 rounded-xl transition-transform transform-gpu active:scale-95">
                  <span className="block px-2 py-1.5 text-center text-xs font-semibold text-slate-400 whitespace-nowrap">{f.label}</span>
                  <span className={`absolute inset-0 flex items-center justify-center px-2 py-1.5 rounded-xl bg-white text-slate-800 text-xs font-semibold whitespace-nowrap transition-opacity duration-150 ${
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
              {/* Search input — same behavior as the Staff List search
                  (name or Gerak ID), shared staffSearch state. */}
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

              <div className="overflow-y-auto no-scrollbar max-h-[420px] lg:max-h-none flex flex-col gap-2">
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

          <div className="grid grid-cols-2 gap-2">
            <NativeSelect value={overviewFilter} onChange={value => setOverviewFilter(value as typeof overviewFilter)} options={[
              { value: 'all', label: 'All Statuses' }, { value: 'payment_valid', label: 'Payment Valid' },
              { value: 'expired', label: 'Expired' }, { value: 'active_drivers', label: 'Active Drivers' },
              { value: 'in_campus', label: 'In Campus' }, { value: 'out_campus', label: 'Out Campus' },
              { value: 'online', label: 'Online' }, { value: 'taking_job', label: 'Taking Job' },
            ]} placeholder="Status" label="Status" />
            <NativeSelect value={staffFilter} onChange={value => { setStaffView('list'); setStaffFilter(value as typeof staffFilter); }} options={[
              { value: 'all', label: 'All Roles' }, { value: 'drivers', label: 'Drivers' },
              { value: 'riders', label: 'Riders' }, { value: 'admins', label: 'Admins' },
            ]} placeholder="Role" label="Role" />
          </div>
          </>)}
        </div>

        {isSuperAdmin && (
          <section className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4 w-full">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Crown className="w-4 h-4 text-slate-400" /> Jubah Lead Assignments
            </h3>
            <p className="text-xs font-normal text-slate-400">A Lead can manage Jubah bookings only for the universities selected here.</p>
            <NativeSelect
              value={leadUserId}
              onChange={value => {
                setLeadUserId(value);
                setLeadUniversityKeys(leadAssignments.filter(row => row.lead_id === value).map(row => row.university_key));
              }}
              options={profileUsers.map(profile => ({ value: profile.id, label: `${profile.name} · ${profile.gerak_id}` }))}
              placeholder="Select Jubah Lead"
              label="Lead"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {UNIVERSITIES.map(university => {
                const selected = leadUniversityKeys.includes(university.key);
                return (
                  <button key={university.key} type="button" onPointerDown={event => {
                    event.preventDefault();
                    setLeadUniversityKeys(keys => selected ? keys.filter(key => key !== university.key) : [...keys, university.key]);
                  }} className={`bg-white border rounded-xl px-3 py-2 text-left text-xs font-semibold transition-transform transform-gpu active:scale-[0.99] ${selected ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-100 text-slate-500'}`}>
                    {university.shortLabel}
                  </button>
                );
              })}
            </div>
            {leadRows.some(row => row.user_id === leadUserId && row.is_active) && (
              <button type="button" disabled={savingLead} onPointerDown={event => { event.preventDefault(); void removeJubahLead(); }}
                className="self-end bg-white border border-red-100 text-red-600 rounded-xl px-4 py-2 text-xs font-semibold transition-transform transform-gpu active:scale-95 disabled:opacity-40">
                Remove Lead
              </button>
            )}
            <button type="button" disabled={savingLead || !leadUserId || leadUniversityKeys.length === 0} onPointerDown={event => { event.preventDefault(); void saveJubahLead(); }}
              className="self-end bg-primary text-white rounded-xl px-4 py-2 text-xs font-semibold transition-transform transform-gpu active:scale-95 disabled:opacity-40">
              {savingLead ? 'Saving…' : 'Save Lead'}
            </button>

            {leadRows.some(row => row.is_active) && <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-700">Assign a Jubah runner under a Lead</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <NativeSelect value={runnerUserId} onChange={setRunnerUserId}
                  options={profileUsers.filter(profile => profile.role === 'rider').map(profile => ({ value: profile.id, label: `${profile.name} · ${profile.gerak_id}` }))}
                  placeholder="Runner" label="Runner" />
                <NativeSelect value={runnerLeadId} onChange={value => { setRunnerLeadId(value); setRunnerUniversityKey(''); }}
                  options={leadRows.filter(row => row.is_active).map(row => { const profile = profileUsers.find(user => user.id === row.user_id); return { value: row.user_id, label: profile?.name ?? row.user_id }; })}
                  placeholder="Lead" label="Lead" />
                <NativeSelect value={runnerUniversityKey} onChange={setRunnerUniversityKey}
                  options={leadAssignments.filter(row => row.lead_id === runnerLeadId).map(row => ({ value: row.university_key, label: UNIVERSITY_MAP[row.university_key]?.shortLabel ?? row.university_key }))}
                  placeholder="University" label="University" />
              </div>
              <button type="button" disabled={savingLead || !runnerUserId || !runnerLeadId || !runnerUniversityKey} onPointerDown={event => { event.preventDefault(); void saveRunnerLead(); }}
                className="self-end bg-primary text-white rounded-xl px-4 py-2 text-xs font-semibold transition-transform transform-gpu active:scale-95 disabled:opacity-40">
                Assign Runner
              </button>
            </div>}
          </section>
        )}

          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4 w-full">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-400" /> Staff Directory ({UNIVERSITY_MAP[universityKey]?.shortLabel})
          </h3>

          {profileUsersTotalCount !== null && profileUsersTotalCount > profileUsers.length && (
            <p className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Showing {profileUsers.length} of {profileUsersTotalCount} staff — use search to find someone else.
            </p>
          )}

          <div
            ref={staffDirectoryScrollRef}
            className="table-scroll-x relative w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-none"
            style={{ contain: 'layout paint' }}
          >
            <div data-axis-y className="max-h-[420px] overflow-y-auto overflow-x-hidden overscroll-none no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(12rem,1.5fr)_6rem_7rem_8rem_minmax(14rem,1.5fr)_7rem_5.5rem_7rem_2.5rem] min-w-[76rem] border-b border-slate-100 bg-white">
              {['Name', 'Role', 'Gerak ID', 'Campus', 'Email', 'Presence', 'Online', 'Work Status', ''].map(label => (
                <div key={label || 'menu'} className="px-3 py-2.5 text-xs font-semibold text-slate-400">{label}</div>
              ))}
            </div>
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : (() => {
              const filtered = filteredUsers;
              return filtered.length === 0
                ? <p className="text-xs text-slate-400 text-center py-4">No {staffFilter === 'all' ? 'staff' : staffFilter} found</p>
                : (
                  <div>
                    {filtered.map(u => (
                      <UserCard key={u.id} u={u} canManage={canManage(u.role, u.id)}
                        isOnline={!!u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() <= 300_000}
                        togglingStatus={togglingStatus} terminating={terminating}
                        togglingCap={togglingCap} togglingCampus={togglingCampus}
                        onToggle={u => setPendingAction({ type: 'toggle-status', u })}
                        onTerminate={u => setPendingAction({ type: 'terminate', u })}
                        onCapToggle={isSuperAdmin ? (u, canDrive, canRent, canTransport) => setPendingAction({ type: 'toggle-cap', u, canDrive, canRent, canTransport }) : undefined}
                        onRiderCapToggle={isSuperAdmin ? (u, canDaily, canRobe) => setPendingAction({ type: 'toggle-rider-cap', u, canDaily, canRobe }) : undefined}
                        onCampusChange={isSuperAdmin ? (u => {
                          setCampusPickerUniversity(universityKeyFromCampus(u.campus) ?? 'umpsa');
                          setCampusPickerCampus(u.campus);
                          setPendingAction({ type: 'campus', u });
                        }) : undefined}
                        onGateToggle={isSuperAdmin ? (u => setPendingAction({ type: 'toggle-gate-exempt', u })) : undefined}
                        onRoleToggle={isSuperAdmin ? (u, newRole) => setPendingAction({ type: 'toggle-role', u, newRole }) : undefined}
                        onVerifyDocuments={u => setReviewingUserId(u.id)}
                        onViewProfile={onViewProfile} />
                    ))}
                  </div>
                );
            })()}
            </div>
          </div>
        </div>
      </div>

      {reviewingUserId && (
        <DocumentVerificationSheet
          userId={reviewingUserId}
          onClose={() => setReviewingUserId(null)}
          onUpdated={loadUsers}
          showToast={showToast}
        />
      )}

      {pendingAction && (() => {
        // Campus/university reassignment needs live pickers, not a static
        // title/desc string — handled as its own sheet, separate from the
        // generic confirm pattern below.
        if (pendingAction.type === 'campus') {
          const u = pendingAction.u;
          return (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
              onPointerDown={(e) => { e.preventDefault(); setPendingAction(null); }}>
              <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 shadow-2xl animate-slide-up"
                style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
                onPointerDown={e => e.stopPropagation()}>
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
                <div className="w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-primary/10">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-black text-slate-800 text-center mb-1">Move {u.name}</h3>
                <p className="text-xs text-slate-400 font-semibold text-center mb-5">
                  Currently {jubahLocationLabel(universityKeyFromCampus(u.campus) ?? '', u.campus)}.
                </p>
                <div className="flex flex-col gap-3 mb-6">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">University</p>
                    <NativeSelect
                      value={campusPickerUniversity}
                      onChange={key => {
                        setCampusPickerUniversity(key);
                        setCampusPickerCampus(UNIVERSITY_MAP[key]?.campuses[0] ?? '');
                      }}
                      options={UNIVERSITIES.map(uni => ({ value: uni.key, label: uni.label }))}
                      placeholder="Select university..."
                      label="Select University"
                    />
                  </div>
                  {(UNIVERSITY_MAP[campusPickerUniversity]?.campuses.length ?? 0) > 1 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1.5">Campus</p>
                      <NativeSelect
                        value={campusPickerCampus}
                        onChange={setCampusPickerCampus}
                        options={(UNIVERSITY_MAP[campusPickerUniversity]?.campuses ?? []).map(c => ({ value: c, label: c }))}
                        placeholder="Select campus..."
                        label="Select Campus"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPendingAction(null)}
                    className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95">
                    Cancel
                  </button>
                  <button onClick={executePendingAction}
                    className="flex-1 font-semibold text-xs py-3 rounded-2xl transition active:scale-95 text-white bg-primary">
                    Yes, Move
                  </button>
                </div>
              </div>
            </div>
          );
        }

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
          (u.receipt_gate_exempt ? `Remove gate exemption for ${u.name}?` : `Exempt ${u.name} from receipt gate?`);

        const desc =
          isTerminate  ? 'This will permanently remove their account. This cannot be undone.' :
          isStop       ? 'They will lose access to the app until reactivated.' :
          pendingAction.type === 'toggle-status' ? 'They will regain access to the app.' :
          pendingAction.type === 'toggle-cap'    ? 'Their service capabilities will be updated immediately.' :
          pendingAction.type === 'toggle-rider-cap' ? 'Their service capabilities will be updated immediately.' :
          pendingAction.type === 'toggle-role'   ? (isRoleToAdmin ? 'They will gain Admin panel access + full driving capabilities.' : 'They will lose Admin panel access and become a driver only.') :
          (u.receipt_gate_exempt ? 'They will need a valid monthly receipt again to stay active.' : 'They will bypass the monthly receipt requirement and stay active regardless.');

        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
            onPointerDown={(e) => { e.preventDefault(); setPendingAction(null); }}>
            <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 shadow-2xl animate-slide-up"
                style={{ paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))' }}
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
