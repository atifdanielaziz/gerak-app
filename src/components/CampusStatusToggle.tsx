import { useEffect, useState } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Self-service In Campus / Out of Campus presence toggle — shown on every
// role's own home screen (Driver Hub, Rider Hub, Admin Panel). Purely
// informational for admin visibility (e.g. a driver away for semester
// break stays "active" but isn't around), fully separate from
// profiles.status (active/suspended) and unrelated to ride availability.
// No RPC needed for self-service — new columns are self-editable by
// default (see 20260804120000_staff_campus_status.sql); admin/superadmin
// overriding someone ELSE's status goes through set_staff_campus_status
// instead (see ProfileSheet.tsx).
interface CampusStatusToggleProps {
  // Some callers (e.g. AdminHome's sticky header) already apply their own
  // horizontal padding to the whole row this sits in — bare skips this
  // component's own px-4 so it doesn't get doubled up. Callers without
  // that (Driver Hub, Rider Hub) rely on the default padding.
  bare?: boolean;
  // 'row' — full-width labeled pills (Driver Hub, Rider Hub). 'icon' —
  // compact icon-only pair sized to sit inline with a header's other
  // small action buttons (Admin Panel, next to Refresh).
  variant?: 'row' | 'icon';
}

export function CampusStatusToggle({ bare, variant = 'row' }: CampusStatusToggleProps) {
  const [status, setStatus]   = useState<'in_campus' | 'out_campus'>('in_campus');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase.from('profiles').select('campus_status').eq('id', authUser.id).single();
      if (data?.campus_status === 'in_campus' || data?.campus_status === 'out_campus') {
        setStatus(data.campus_status);
      }
    })();
  }, []);

  const handleSet = async (next: 'in_campus' | 'out_campus') => {
    if (next === status || saving) return;
    setSaving(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setSaving(false); return; }
    const { error } = await supabase.from('profiles').update({ campus_status: next }).eq('id', authUser.id);
    setSaving(false);
    if (!error) setStatus(next);
  };

  if (variant === 'icon') {
    // Single switch-style icon, same idea as the Active/Inactive toggle in
    // BannersTab.tsx — ToggleRight (switch to the right) = In Campus,
    // ToggleLeft (switch to the left) = Out of Campus. Tapping flips it.
    const isIn = status === 'in_campus';
    return (
      <button
        onPointerDown={e => { e.preventDefault(); handleSet(isIn ? 'out_campus' : 'in_campus'); }}
        disabled={saving}
        title={isIn ? 'In Campus — tap to set Out of Campus' : 'Out of Campus — tap to set In Campus'}
        aria-label={isIn ? 'Currently In Campus, tap to switch to Out of Campus' : 'Currently Out of Campus, tap to switch to In Campus'}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 transition-transform transform-gpu active:scale-90 disabled:opacity-50"
      >
        {isIn
          ? <ToggleRight className="w-5 h-5 text-emerald-500" />
          : <ToggleLeft className="w-5 h-5 text-slate-400" />}
      </button>
    );
  }

  return (
    <div className={bare ? '' : 'px-4 pb-3'}>
      {/* Same opacity-overlay toggle technique used everywhere else — this
          WebView unreliably repaints colour changes, but reliably repaints
          opacity. */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
        {(['in_campus', 'out_campus'] as const).map(s => (
          <button
            key={s}
            onPointerDown={e => { e.preventDefault(); handleSet(s); }}
            disabled={saving}
            className="relative flex-1 rounded-xl transition-transform transform-gpu active:scale-95 disabled:opacity-50"
          >
            <span className="block py-2 text-xs font-semibold text-slate-400 text-center">
              {s === 'in_campus' ? 'In Campus' : 'Out of Campus'}
            </span>
            <span className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl text-xs font-semibold text-white transition-opacity duration-150 ${
              s === 'in_campus' ? 'bg-emerald-500' : 'bg-slate-500'
            } ${status === s ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {s === 'in_campus' ? 'In Campus' : 'Out of Campus'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
