import { useEffect, useState } from 'react';
import { UserCog, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';

type RiderOption = { id: string; name: string; phone: string | null; order_count: number; at_cap: boolean; is_current: boolean };

// Rider can only be changed before the robe is collected — enforced again
// server-side in superadmin_reassign_jubah_rider.
const CHANGEABLE = ['ordered', 'paid', 'processing'];

interface Props {
  bookingId: string;
  status: string;
  onChanged: (newRiderName: string) => void;
  showToast?: (msg: string) => void;
}

// Superadmin-only "Change Rider" button + picker. The caller decides
// whether to render it for the viewer's role; the RPCs re-check superadmin
// server-side, so rendering it for anyone else would just fail safely.
export function JubahChangeRider({ bookingId, status, onChanged, showToast }: Props) {
  const { showConfirmModal, setSheetOpen } = useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [open, setSheetOpen]);

  const openPicker = async () => {
    setOpen(true);
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('superadmin_list_jubah_riders_for_booking', { p_booking_id: bookingId });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setRiders((data as RiderOption[]) ?? []);
  };

  const reassign = async (r: RiderOption) => {
    setSaving(true);
    const { data, error: err } = await supabase.rpc('superadmin_reassign_jubah_rider', { p_booking_id: bookingId, p_new_rider_id: r.id });
    if (err || !data?.success) {
      setSaving(false);
      showToast?.(data?.error ?? err?.message ?? 'Could not change the rider.');
      return;
    }
    // Best effort — the reassignment has already committed; a failed email
    // must not undo it or block the UI.
    const { data: mail, error: mailErr } = await supabase.functions.invoke('send-jubah-receipt-email', {
      body: { bookingId, stage: 'rider_changed' },
    });
    if (mailErr || !mail?.success) console.error('[GERAK] rider-changed email failed:', mailErr ?? mail?.reason);
    setSaving(false);
    showToast?.(`Rider changed to ${r.name}. Customer emailed.`);
    onChanged(r.name);
  };

  // The confirm dialog shares the picker's layer, so close the picker first.
  const confirm = (r: RiderOption) => { setOpen(false); showConfirmModal({
    title: 'Change rider?',
    message: `${r.name} will take over this order. The customer gets a new receipt by email and must update their ICMS Runner.${r.at_cap ? ` Note: this rider is already at the order cap (${r.order_count} orders).` : ''}`,
    confirmLabel: 'CHANGE RIDER',
    onConfirm: () => { void reassign(r); },
  }); };

  if (!CHANGEABLE.includes(status)) return null;

  return (
    <>
      <button type="button" onClick={() => { void openPicker(); }}
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 font-semibold py-2.5 rounded-2xl text-xs transition active:scale-[0.99] active:bg-slate-50">
        <UserCog className="w-4 h-4" /> Change Rider
      </button>

      {open && (
        // Floating Message Standard — same centred card as JubahQrButton.
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          onPointerDown={e => { e.preventDefault(); if (!saving) setOpen(false); }}>
          <div className="w-full max-w-[360px] max-h-[calc(100dvh-5rem)] bg-white border border-slate-100 rounded-3xl flex flex-col overflow-hidden"
            onPointerDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><UserCog className="w-4 h-4" /> Change Rider</span>
              <button onClick={() => setOpen(false)} disabled={saving} aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2 overflow-y-auto no-scrollbar">
              <p className="text-xs text-slate-400">Riders covering this campus and delivery method.</p>
              {loading && <div className="flex justify-center py-6"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>}
              {!loading && riders.map(r => (
                <button key={r.id} type="button" disabled={r.is_current || saving}
                  onClick={() => confirm(r)}
                  className="w-full flex items-center justify-between gap-3 border border-slate-100 rounded-2xl px-3 py-2.5 text-left active:bg-slate-50 transition disabled:opacity-60">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-700 truncate">{r.name}</span>
                    <span className="block text-[11px] text-slate-400">{r.order_count} orders</span>
                  </span>
                  {r.is_current
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">Current</span>
                    : r.at_cap
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">Full</span>
                      : null}
                </button>
              ))}
              {!loading && !riders.length && !error && <p className="text-xs text-slate-400 text-center py-4">No other riders cover this campus and method.</p>}
              {error && <p className="text-xs font-semibold text-danger">{error}</p>}
              {saving && <p className="text-xs text-slate-500 text-center">Changing rider…</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
