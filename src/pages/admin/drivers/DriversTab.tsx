import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  UserPlus, Send, MapPin, Mail, Car, KeyRound, Bike, GraduationCap, X, AlertCircle, Settings, Truck,
} from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { useApp } from '../../../context/AppContext';
import { NativeSelect } from '../../../components/NativeSelect';
import { UNIVERSITIES, UNIVERSITY_MAP, jubahLocationLabel, universityKeyFromCampus } from '../../../lib/universities';

interface DriverInvite {
  id: string;
  email: string;
  campus: string;
  university: string | null;
  role: string;
  can_drive: boolean;
  can_rent: boolean;
  can_transport: boolean;
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
  { active, isSuperAdmin, adminCampus, userName, showToast, onModalOpenChange },
  ref
) {
  const { showConfirmModal } = useApp();
  const [invites, setInvites]               = useState<DriverInvite[]>([]);
  const [invitesLoading, setInvitesLoading]  = useState(false);
  const [inviteSearch, setInviteSearch]      = useState('');
  const [inviteEmail, setInviteEmail]        = useState('');
  const [inviteUniversityKey, setInviteUniversityKey] = useState(isSuperAdmin ? 'umpsa' : (universityKeyFromCampus(adminCampus) ?? 'umpsa'));
  const [inviteCampus, setInviteCampus]      = useState(isSuperAdmin ? 'Gambang' : adminCampus);
  const [inviteRole, setInviteRole]          = useState<'driver' | 'rider' | 'admin'>('driver');
  const [inviteCanDrive, setInviteCanDrive]  = useState(true);
  const [inviteCanRent,  setInviteCanRent]   = useState(false);
  const [inviteCanTransport, setInviteCanTransport] = useState(false);
  const [inviteCanDaily, setInviteCanDaily]  = useState(false);
  const [inviteCanRobe,  setInviteCanRobe]   = useState(false);
  const [inviteSending, setInviteSending]    = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);

  useEffect(() => { onModalOpenChange(showInviteConfirm); }, [showInviteConfirm, onModalOpenChange]);

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true);
    let query = supabase
      .from('driver_invites')
      .select('id,email,campus,university,role,can_drive,can_rent,can_transport,used,used_at,created_at')
      .order('created_at', { ascending: false });
    if (!isSuperAdmin) query = query.eq('campus', adminCampus);
    const { data } = await query;
    setInvites(data ?? []);
    setInvitesLoading(false);
  }, [isSuperAdmin, adminCampus]);

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

          {/* Role selector */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Role</p>
            <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1">
              {([
                { id: 'driver', label: 'Driver', color: 'bg-primary text-white' },
                { id: 'rider',  label: 'Rider',  color: 'bg-emerald-600 text-white' },
                { id: 'admin',  label: 'Admin',  color: 'bg-violet-600 text-white' },
              ] as const).map(r => (
                // Two stacked layers instead of toggling colour classes
                // directly — this WebView unreliably repaints colour
                // changes; opacity changes repaint reliably.
                <button key={r.id} type="button"
                  onPointerDown={e => {
                    e.preventDefault();
                    setInviteRole(r.id);
                    setInviteCanDrive(r.id === 'driver');
                    setInviteCanRent(false);
                    setInviteCanTransport(false);
                    setInviteCanDaily(false);
                    setInviteCanRobe(false);
                  }}
                  className="relative flex-1 rounded-xl transition-transform">
                  <span className="block py-2 text-xs font-semibold text-slate-400">{r.label}</span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl text-xs font-semibold transition-opacity duration-150 ${r.color} ${
                      inviteRole === r.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {r.label}
                  </span>
                </button>
              ))}
            </div>
            {inviteRole === 'admin' && (
              <p className="text-xs text-violet-500 font-semibold mt-1.5 pl-1">
                Admin includes full driving capabilities automatically.
              </p>
            )}
          </div>

          {/* University + Campus picker — superadmin only; regular admin
              locked to their own university/campus */}
          {isSuperAdmin ? (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">University</p>
                <NativeSelect
                  value={inviteUniversityKey}
                  onChange={key => {
                    setInviteUniversityKey(key);
                    setInviteCampus(UNIVERSITY_MAP[key]?.campuses[0] ?? '');
                  }}
                  options={UNIVERSITIES.map(u => ({ value: u.key, label: u.label }))}
                  placeholder="Select university..."
                  label="Select University"
                />
              </div>
              {/* Campus only shown when the chosen university has a real
                  multi-campus split — a single-campus university is
                  auto-filled above, nothing left to ask. */}
              {(UNIVERSITY_MAP[inviteUniversityKey]?.campuses.length ?? 0) > 1 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Campus</p>
                  <NativeSelect
                    value={inviteCampus}
                    onChange={setInviteCampus}
                    options={(UNIVERSITY_MAP[inviteUniversityKey]?.campuses ?? []).map(c => ({ value: c, label: c }))}
                    placeholder="Select campus..."
                    label="Select Campus"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5">
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs font-semibold text-slate-700">{jubahLocationLabel(inviteUniversityKey, adminCampus)}</p>
              <span className="text-xs font-normal text-slate-400 ml-auto">campus locked</span>
            </div>
          )}

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

          {/* Capability toggles — driver */}
          {inviteRole === 'driver' && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Capabilities</p>
              <div className="flex gap-2">
                <button type="button" onPointerDown={(e) => { e.preventDefault(); setInviteCanDrive(v => !v); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-transform active:scale-95 ${
                    inviteCanDrive ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                  <Car className="w-3 h-3" /> Gerak Car {inviteCanDrive ? '✓' : '✗'}
                </button>
                <button type="button" onPointerDown={(e) => { e.preventDefault(); setInviteCanRent(v => !v); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-transform active:scale-95 ${
                    inviteCanRent ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                  <KeyRound className="w-3 h-3" /> Rental {inviteCanRent ? '✓' : '✗'}
                </button>
                <button type="button" onPointerDown={(e) => { e.preventDefault(); setInviteCanTransport(v => !v); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-transform active:scale-95 ${
                    inviteCanTransport ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                  <Truck className="w-3 h-3" /> Transporter {inviteCanTransport ? '✓' : '✗'}
                </button>
              </div>
            </div>
          )}

          {/* Capability toggles — rider */}
          {inviteRole === 'rider' && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Capabilities</p>
              <div className="flex gap-2">
                <button type="button" onPointerDown={(e) => { e.preventDefault(); setInviteCanDaily(v => !v); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-transform active:scale-95 ${
                    inviteCanDaily ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                  <Bike className="w-3.5 h-3.5" /> Daily {inviteCanDaily ? '✓' : '✗'}
                </button>
                <button type="button" onPointerDown={(e) => { e.preventDefault(); setInviteCanRobe(v => !v); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-transform active:scale-95 ${
                    inviteCanRobe ? 'bg-white border-slate-900 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                  <GraduationCap className="w-3.5 h-3.5" /> Robe {inviteCanRobe ? '✓' : '✗'}
                </button>
              </div>
            </div>
          )}

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
            <div className="overflow-y-auto no-scrollbar max-h-[360px] flex flex-col gap-2">
              {invites.filter(inv => !inviteSearch.trim() || inv.email.toLowerCase().includes(inviteSearch.toLowerCase())).map(inv => (
                <div key={inv.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border ${
                  inv.used ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'
                }`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{inv.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs font-normal text-slate-400 uppercase">{inv.campus}</span>
                      {inv.used
                        ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">Registered</span>
                        : <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Pending</span>}
                      {inv.can_drive && (
                        <span className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Car className="w-2.5 h-2.5" /> Car
                        </span>
                      )}
                      {inv.can_rent && (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <KeyRound className="w-2.5 h-2.5" /> Rental
                        </span>
                      )}
                      {inv.can_transport && (
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Truck className="w-2.5 h-2.5" /> Transporter
                        </span>
                      )}
                    </div>
                  </div>
                  {!inv.used && (
                    <button
                      onClick={() => showConfirmModal({
                        title: 'Revoke Invite?',
                        message: `This cancels the pending invite for ${inv.email}. This can't be undone.`,
                        confirmLabel: 'REVOKE',
                        onConfirm: () => handleRevokeInvite(inv.id),
                      })}
                      className="w-7 h-7 flex items-center justify-center rounded-xl bg-red-50 border border-red-100 text-red-400 hover:text-red-600 transition active:scale-90 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
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
