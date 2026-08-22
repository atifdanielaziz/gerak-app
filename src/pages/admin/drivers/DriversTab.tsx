import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  UserPlus, Send, Mail, Car, KeyRound, Bike, GraduationCap, X, AlertCircle, Settings, Truck,
} from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { useApp } from '../../../context/AppContext';
import { NativeSelect } from '../../../components/NativeSelect';
import { MultiSelect } from '../../../components/MultiSelect';
import { UNIVERSITY_MAP, jubahLocationLabel, universityKeyFromCampus } from '../../../lib/universities';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';

interface DriverInvite {
  id: string;
  email: string;
  campus: string;
  university: string | null;
  role: string;
  can_drive: boolean;
  can_rent: boolean;
  can_transport: boolean;
  can_daily: boolean;
  can_robe: boolean;
  used: boolean;
  used_at: string | null;
  created_at: string;
}

export interface DriversTabHandle {
  reload: () => void;
}

interface DriversTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: string;
  universityKey: string;
  userName: string;
  showToast: (msg: string) => void;
  // Bubbles the confirm-modal's open state up so AdminHome's shared
  // "hide BottomNav while any sheet is open" effect still sees it — the
  // same role sheetUser/pendingAction/etc already play at the parent level.
  onModalOpenChange: (open: boolean) => void;
}

// Staff invite management — split out of AdminHome.tsx. Exposes reload()
// via ref so the shared pull-to-refresh dispatcher (refreshActiveTab in
// AdminHome) can still trigger it without this component's data living in
// the parent.
export const DriversTab = forwardRef<DriversTabHandle, DriversTabProps>(function DriversTab(
  { active, universityKey, userName, showToast, onModalOpenChange },
  ref
) {
  const { showConfirmModal } = useApp();
  const inviteDirectoryScrollRef = useAxisLockedScroll<HTMLDivElement>();
  const [invites, setInvites]               = useState<DriverInvite[]>([]);
  const [invitesLoading, setInvitesLoading]  = useState(false);
  const [inviteSearch, setInviteSearch]      = useState('');
  const [inviteEmail, setInviteEmail]        = useState('');
  const inviteUniversityKey = universityKey;
  const [inviteCampus, setInviteCampus]      = useState(UNIVERSITY_MAP[universityKey]?.campuses[0] ?? '');
  const [inviteRole, setInviteRole]          = useState<'driver' | 'rider' | 'admin'>('driver');
  const [inviteCanDrive, setInviteCanDrive]  = useState(true);
  const [inviteCanRent,  setInviteCanRent]   = useState(false);
  const [inviteCanTransport, setInviteCanTransport] = useState(false);
  const [inviteCanDaily, setInviteCanDaily]  = useState(false);
  const [inviteCanRobe,  setInviteCanRobe]   = useState(false);
  const [inviteSending, setInviteSending]    = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);

  useEffect(() => { onModalOpenChange(showInviteConfirm); }, [showInviteConfirm, onModalOpenChange]);
  useEffect(() => {
    const campuses = UNIVERSITY_MAP[universityKey]?.campuses ?? [];
    setInviteCampus(current => campuses.includes(current) ? current : (campuses[0] ?? ''));
  }, [universityKey]);

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    let query = supabase
      .from('driver_invites')
      .select('id,email,campus,university,role,can_drive,can_rent,can_transport,can_daily,can_robe,used,used_at,created_at')
      .order('created_at', { ascending: false });
    const campuses = UNIVERSITY_MAP[universityKey]?.campuses ?? [];
    if (campuses.length) query = query.in('campus', campuses);
    const { data } = await query;
    setInvites(data ?? []);
    setInvitesLoading(false);
  }, [universityKey]);

  useLoadOnActive(active, loadInvites);
  useImperativeHandle(ref, () => ({ reload: loadInvites }), [loadInvites]);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    if (inviteRole === 'driver' && !inviteCanDrive && !inviteCanRent && !inviteCanTransport) { showToast('Select at least one capability.'); return; }
    if (inviteRole === 'rider'  && !inviteCanDaily && !inviteCanRobe)  { showToast('Select at least one capability.'); return; }
    setInviteSending(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase.from('driver_invites').insert({
      email:      inviteEmail.trim().toLowerCase(),
      campus:     inviteCampus,
      university: UNIVERSITY_MAP[inviteUniversityKey]?.fullName ?? '',
      role:       inviteRole,
      can_drive:     inviteRole === 'driver' ? inviteCanDrive     : false,
      can_rent:      inviteRole === 'driver' ? inviteCanRent      : false,
      can_transport: inviteRole === 'driver' ? inviteCanTransport : false,
      can_daily:  inviteRole === 'rider'  ? inviteCanDaily : false,
      can_robe:   inviteRole === 'rider'  ? inviteCanRobe  : false,
      created_by: authUser?.id,
    }).select('id').single();
    setInviteSending(false);
    if (error) showToast(error.message.includes('unique') ? 'This email already has a pending invite.' : error.message);
    else {
      showToast('Invite added!');
      setInviteEmail('');
      setInviteRole('driver');
      setInviteCanDrive(true); setInviteCanRent(false); setInviteCanTransport(false);
      setInviteCanDaily(false); setInviteCanRobe(false);
      loadInvites();
      // Best-effort — a failed email should never undo or block the invite
      // itself, which has already committed to the database by this point.
      if (inserted?.id) {
        supabase.functions.invoke('send-staff-invite-email', { body: { inviteId: inserted.id } })
          .then(({ data, error: fnError }) => {
            if (fnError || !data?.success) console.error('send-staff-invite-email failed:', fnError ?? data?.reason);
          })
          .catch(err => console.error('send-staff-invite-email failed:', err));
      }
    }
  };

  const handleRevokeInvite = async (id: string) => {
    const { error } = await supabase.from('driver_invites').delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message); return; }
    showToast('Invite removed.');
    loadInvites();
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Invite form */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4 text-primary" /> Invite Staff
          </h3>

          {/* Role and capabilities — equal-width controls on one row */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 mb-2">Role</p>
              <NativeSelect
                value={inviteRole}
                onChange={r => {
                  setInviteRole(r);
                  setInviteCanDrive(r === 'driver');
                  setInviteCanRent(false);
                  setInviteCanTransport(false);
                  setInviteCanDaily(false);
                  setInviteCanRobe(false);
                }}
                options={[
                  { value: 'driver', label: 'Driver' },
                  { value: 'rider',  label: 'Rider' },
                  { value: 'admin',  label: 'Admin' },
                ]}
                placeholder="Select role..."
                label="Select Role"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 mb-2">Capabilities</p>
              {inviteRole === 'driver' && (
                <MultiSelect
                  values={[...(inviteCanDrive ? ['drive'] : []), ...(inviteCanRent ? ['rent'] : []), ...(inviteCanTransport ? ['transport'] : [])]}
                  onChange={vals => {
                    setInviteCanDrive(vals.includes('drive'));
                    setInviteCanRent(vals.includes('rent'));
                    setInviteCanTransport(vals.includes('transport'));
                  }}
                  options={[{ value: 'drive', label: 'Gerak Car' }, { value: 'rent', label: 'Rental' }, { value: 'transport', label: 'Transporter' }]}
                  placeholder="Select capabilities..."
                />
              )}
              {inviteRole === 'rider' && (
                <MultiSelect
                  values={[...(inviteCanDaily ? ['daily'] : []), ...(inviteCanRobe ? ['robe'] : [])]}
                  onChange={vals => {
                    setInviteCanDaily(vals.includes('daily'));
                    setInviteCanRobe(vals.includes('robe'));
                  }}
                  options={[{ value: 'daily', label: 'Daily' }, { value: 'robe', label: 'Robe' }]}
                  placeholder="Select capabilities..."
                />
              )}
              {inviteRole === 'admin' && (
                <div className="h-[42px] flex items-center rounded-xl border border-slate-100 bg-white px-3 text-xs font-semibold text-slate-700">Full access</div>
              )}
            </div>
          </div>

          {/* University + Campus picker — superadmin only; regular admin
              locked to their own university/campus */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Campus</p>
              {/* Campus only shown when the chosen university has a real
                  multi-campus split — a single-campus university is
                  auto-filled above, nothing left to ask. */}
            <NativeSelect
                    value={inviteCampus}
                    onChange={setInviteCampus}
                    options={(UNIVERSITY_MAP[inviteUniversityKey]?.campuses ?? []).map(c => ({ value: c, label: c }))}
                    placeholder="Select campus..."
                    label="Select Campus"
            />
          </div>

          {/* Email input */}
          <div className="relative">
            <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inviteEmail.trim() && setShowInviteConfirm(true)}
              placeholder="staff@email.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
            />
          </div>

          <button
            onClick={() => {
              if (!inviteEmail.trim()) return;
              if (inviteRole === 'driver' && !inviteCanDrive && !inviteCanRent && !inviteCanTransport) { showToast('Select at least one capability.'); return; }
              setShowInviteConfirm(true);
            }}
            disabled={!inviteEmail.trim()}
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
          >
            <Send className="w-3.5 h-3.5" /> Add Invite
          </button>
        </div>

        {/* Search */}
        <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Find Staff
          </h3>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteSearch}
              onChange={e => setInviteSearch(e.target.value)}
              placeholder="Search by email"
              style={{ fontSize: '12px' }}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
            />
            <button
              onClick={() => setInviteSearch('')}
              disabled={!inviteSearch.trim()}
              className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Invite list */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Mail className="w-4 h-4" /> Invite List
          </h3>

          {invitesLoading ? (
            <div className="flex justify-center py-6">
              <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            </div>
          ) : invites.filter(inv => !inviteSearch.trim() || inv.email.toLowerCase().includes(inviteSearch.toLowerCase())).length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold text-center py-4">
              {inviteSearch.trim() ? 'No matching invites found' : 'No invites yet'}
            </p>
          ) : (
            <div ref={inviteDirectoryScrollRef}
              className="table-scroll-x relative w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-none"
              style={{ contain: 'layout paint' }}>
              <div data-axis-y className="max-h-[360px] overflow-y-auto overflow-x-hidden overscroll-none no-scrollbar"
                style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="min-w-[60rem] w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-normal text-slate-400">
                    {['Email', 'Role', 'Campus', 'Status', 'Capabilities', 'Invited', ''].map(label => (
                      <th key={label || 'action'} className="sticky top-0 bg-white py-2 pr-4 whitespace-nowrap font-semibold">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invites.filter(inv => !inviteSearch.trim() || inv.email.toLowerCase().includes(inviteSearch.toLowerCase())).map(inv => {
                    const capabilities = [
                      inv.can_drive && 'Car', inv.can_rent && 'Rental', inv.can_transport && 'Transporter',
                      inv.can_daily && 'Daily', inv.can_robe && 'Robe',
                    ].filter(Boolean).join(', ') || (inv.role === 'admin' ? 'Full access' : '—');
                    return (
                      <tr key={inv.id} className="border-b border-slate-100 text-xs">
                        <td className="py-2.5 pr-4 font-semibold text-slate-800 whitespace-nowrap">{inv.email}</td>
                        <td className="py-2.5 pr-4 text-slate-600 capitalize whitespace-nowrap">{inv.role}</td>
                        <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{jubahLocationLabel(universityKeyFromCampus(inv.campus) ?? '', inv.campus)}</td>
                        <td className={`py-2.5 pr-4 font-semibold whitespace-nowrap ${inv.used ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {inv.used ? 'Registered' : 'Pending'}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{capabilities}</td>
                        <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{new Date(inv.created_at).toLocaleDateString('en-MY')}</td>
                        <td className="py-2.5 text-right">
                          {!inv.used ? (
                            <button type="button" aria-label={`Revoke invite for ${inv.email}`}
                              onPointerDown={e => {
                                e.preventDefault();
                                showConfirmModal({
                                  title: 'Revoke Invite?',
                                  message: `This cancels the pending invite for ${inv.email}. This can't be undone.`,
                                  confirmLabel: 'REVOKE',
                                  onConfirm: () => handleRevokeInvite(inv.id),
                                });
                              }}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-xl text-red-500 active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      </div>

      {showInviteConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onPointerDown={(e) => { e.preventDefault(); setShowInviteConfirm(false); }}
        >
          <div
            className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
            onPointerDown={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

            {/* Title */}
            <h3 className="text-sm font-black text-slate-800 text-center mb-1">Confirm {inviteRole === 'admin' ? 'Admin' : inviteRole === 'rider' ? 'Rider' : 'Driver'} Invite</h3>
            <p className="text-xs text-slate-400 font-semibold text-center mb-5">
              Please review before sending.
            </p>

            {/* Receipt-style card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden mb-5">

              {/* Header stripe */}
              <div className={`px-4 py-3 flex items-center gap-2 ${inviteRole === 'admin' ? 'bg-violet-600' : inviteRole === 'rider' ? 'bg-emerald-600' : 'bg-primary'}`}>
                <Send className="w-3.5 h-3.5 text-white" />
                <span className="text-white font-semibold text-xs uppercase tracking-widest">{inviteRole === 'admin' ? 'Admin' : inviteRole === 'rider' ? 'Rider' : 'Driver'} Invite</span>
              </div>

              {/* Details */}
              <div className="px-4 py-4 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-normal text-slate-400">Email</p>
                  <p className="text-xs font-semibold text-slate-800 text-right break-all">{inviteEmail.trim().toLowerCase()}</p>
                </div>

                <div className="h-px bg-slate-100" />

                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-normal text-slate-400">Campus</p>
                  <span className="text-xs font-semibold text-slate-800">{jubahLocationLabel(inviteUniversityKey, inviteCampus)}</span>
                </div>

                <div className="h-px bg-slate-100" />

                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-normal text-slate-400">Capabilities</p>
                  <div className="flex flex-col items-end gap-1.5">
                    {inviteRole === 'driver' && (<>
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanDrive ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400 line-through'}`}>
                        <Car className="w-3 h-3" /> Gerak Car {inviteCanDrive ? '✓' : '✗'}
                      </span>
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanRent ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                        <KeyRound className="w-3 h-3" /> Gerak Rental {inviteCanRent ? '✓' : '✗'}
                      </span>
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanTransport ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                        <Truck className="w-3 h-3" /> Gerak Transporter {inviteCanTransport ? '✓' : '✗'}
                      </span>
                    </>)}
                    {inviteRole === 'rider' && (<>
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanDaily ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                        <Bike className="w-3 h-3" /> Gerak Daily {inviteCanDaily ? '✓' : '✗'}
                      </span>
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${inviteCanRobe ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                        <GraduationCap className="w-3 h-3" /> Robe Convocation {inviteCanRobe ? '✓' : '✗'}
                      </span>
                    </>)}
                    {inviteRole === 'admin' && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700">
                        <Settings className="w-3 h-3" /> Full Access
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer stripe */}
              <div className="bg-slate-100 px-4 py-2.5">
                <p className="text-xs text-slate-400 font-semibold text-center">
                  Sent by {userName} · {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowInviteConfirm(false)}
                className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowInviteConfirm(false); handleSendInvite(); }}
                disabled={inviteSending}
                className="flex-1 bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-primary/20"
              >
                {inviteSending
                  ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <><Send className="w-3.5 h-3.5" /> Yes, Send Invite</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
