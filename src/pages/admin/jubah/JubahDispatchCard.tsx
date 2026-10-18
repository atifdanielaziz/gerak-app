import { useCallback, useState } from 'react';
import { Truck, Pencil, Link2, Copy, Check, Ban, RotateCcw, Mail } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../context/AppContext';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { copyToClipboard } from '../../../lib/clipboard';
import { UNIVERSITY_MAP } from '../../../lib/universities';

type SenderRow = {
  rider_id: string; rider_name: string;
  name: string | null; phone: string | null; address: string | null; postcode: string | null; city: string | null; state: string | null;
};
type LinkRow = { id: string; created_at: string; expires_at: string; revoked_at: string | null; active: boolean };
type Draft = { name: string; phone: string; address: string; postcode: string; city: string; state: string };

const emptyDraft: Draft = { name: '', phone: '', address: '', postcode: '', city: '', state: '' };
const fmt = (iso: string) => new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });

// Superadmin-only: sender details per postage runner, and the secret link
// J&T counter staff open on their own laptop (gerakmy.com/jnt#<token>).
// The token is shown once when created — only its hash is stored — so a
// lost link is revoked and a new one created. Server side:
// migration 20261017100000_jubah_jnt_dispatch.sql.
export function JubahDispatchCard({ active, showToast, jubahUniversity }: {
  active: boolean; showToast: (msg: string) => void; jubahUniversity: string;
}) {
  const { showConfirmModal } = useApp();
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [trackInfo, setTrackInfo] = useState<{ pending: number; no_email: number; emailed: number } | null>(null);
  const [sendingEmails, setSendingEmails] = useState(false);
  const uniLabel = UNIVERSITY_MAP[jubahUniversity]?.shortLabel ?? jubahUniversity.toUpperCase();

  const load = useCallback(async () => {
    const [{ data: s, error: se }, { data: l, error: le }, { data: t }] = await Promise.all([
      supabase.rpc('get_jubah_dispatch_senders'),
      supabase.rpc('list_jubah_dispatch_links', { p_university: jubahUniversity }),
      supabase.rpc('count_jubah_tracking_unsent', { p_university: jubahUniversity }),
    ]);
    if (se || le) { showToast((se ?? le)!.message); return; }
    setSenders((s as SenderRow[]) ?? []);
    setLinks((l as LinkRow[]) ?? []);
    setTrackInfo(t?.success ? { pending: t.pending, no_email: t.no_email, emailed: t.emailed } : null);
  }, [jubahUniversity, showToast]);
  useLoadOnActive(active, load);

  const startEdit = (r: SenderRow) => {
    setEditing(r.rider_id);
    setDraft({
      name: r.name ?? r.rider_name, phone: r.phone ?? '', address: r.address ?? '',
      postcode: r.postcode ?? '', city: r.city ?? '', state: r.state ?? '',
    });
  };

  const save = async (riderId: string) => {
    setSaving(true);
    const { data, error } = await supabase.rpc('set_jubah_dispatch_sender', {
      p_rider_id: riderId, p_name: draft.name, p_phone: draft.phone, p_address: draft.address,
      p_postcode: draft.postcode, p_city: draft.city, p_state: draft.state,
    });
    setSaving(false);
    if (error || !data?.success) { showToast(data?.error ?? error?.message ?? 'Failed to save.'); return; }
    showToast('Sender saved ✓');
    setEditing(null);
    void load();
  };

  const createLink = () => showConfirmModal({
    title: 'Create J&T link?',
    message: `Anyone with this link can see the name, phone, email and address of every ${uniLabel} postage parcel for 3 days. Share it only with the J&T counter.`,
    confirmLabel: 'CREATE LINK',
    onConfirm: async () => {
      setCreating(true);
      const { data, error } = await supabase.rpc('create_jubah_dispatch_link', { p_university: jubahUniversity, p_days: 3 });
      setCreating(false);
      if (error || !data?.success) { showToast(data?.error ?? error?.message ?? 'Failed to create link.'); return; }
      setNewLink(`${window.location.origin}/jnt#${data.token}`);
      setCopied(false);
      void load();
    },
  });

  const revoke = (l: LinkRow) => showConfirmModal({
    title: 'Revoke this link?',
    message: 'The J&T page stops working straight away for anyone using it.',
    confirmLabel: 'REVOKE',
    onConfirm: async () => {
      const { data, error } = await supabase.rpc('revoke_jubah_dispatch_link', { p_id: l.id });
      if (error || !data?.success) { showToast(data?.error ?? error?.message ?? 'Failed to revoke.'); return; }
      showToast('Link revoked.');
      setNewLink(null);
      void load();
    },
  });

  // Batch send, after checking the numbers J&T staff entered. Each tracking
  // number is emailed once (edge function send-jubah-tracking-emails).
  const sendTrackingEmails = () => showConfirmModal({
    title: 'Send tracking emails?',
    message: `Emails ${trackInfo?.pending ?? 0} customer${trackInfo?.pending === 1 ? '' : 's'} their J&T tracking number with a link to track the parcel. Check the numbers on the J&T page first — each number is sent only once.`,
    confirmLabel: 'SEND EMAILS',
    onConfirm: async () => {
      setSendingEmails(true);
      const { data, error } = await supabase.functions.invoke('send-jubah-tracking-emails', { body: { universityKey: jubahUniversity } });
      setSendingEmails(false);
      if (error || !data?.success) { showToast(data?.error ?? 'Failed to send emails.'); return; }
      showToast(data.failed?.length ? `Sent ${data.sent}, failed ${data.failed.length}: ${data.failed.join(', ')}` : `Sent ${data.sent} tracking email${data.sent === 1 ? '' : 's'} ✓`);
      void load();
    },
  });

  const resetAll = () => showConfirmModal({
    title: 'Reset all copy progress?',
    message: `Clears every "Copied" and "Siap" mark on the ${uniLabel} J&T page, so all parcels show as not done. Tracking numbers already entered are kept.`,
    confirmLabel: 'RESET',
    onConfirm: async () => {
      const { data, error } = await supabase.rpc('reset_jubah_dispatch', { p_university: jubahUniversity, p_include_tracking: false });
      if (error || !data?.success) { showToast(data?.error ?? error?.message ?? 'Failed to reset.'); return; }
      showToast(`Reset ${data.count} parcel${data.count === 1 ? '' : 's'} ✓`);
    },
  });

  const input = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold text-slate-700 focus:outline-none focus:border-primary transition w-full';

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Truck className="w-4 h-4" /> J&amp;T Postage ({uniLabel})
      </h3>
      <p className="text-xs text-slate-400 font-semibold -mt-2.5">
        A page for J&amp;T counter staff to copy each parcel's details. Parcels use their runner's sender details below.
      </p>

      {/* Sender per postage runner */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-500">Sender details</p>
        {senders.map(r => (
          <div key={r.rider_id} className="border border-slate-100 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{r.rider_name}</p>
                {r.name
                  ? <p className="text-[11px] text-slate-500 break-words">{r.name} · <span className="font-mono">{r.phone}</span> · {r.address}, {r.postcode} {r.city}, {r.state}</p>
                  : <p className="text-[11px] font-semibold text-amber-600">Not set — J&amp;T will see a warning for this runner's parcels</p>}
              </div>
              {editing !== r.rider_id && (
                <button type="button" onClick={() => startEdit(r)}
                  className="h-11 px-3 flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold active:scale-95 transition shrink-0">
                  <Pencil className="w-3.5 h-3.5" /> {r.name ? 'Edit' : 'Set up'}
                </button>
              )}
            </div>
            {editing === r.rider_id && (
              <div className="flex flex-col gap-2 pt-1" style={{ fontSize: '13px' }}>
                <input className={input} placeholder="Sender name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                <input className={`${input} font-mono`} placeholder="Phone" inputMode="tel" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} />
                <input className={input} placeholder="Address" value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))} />
                <div className="grid grid-cols-3 gap-2">
                  <input className={`${input} font-mono`} placeholder="Postcode" inputMode="numeric" maxLength={5} value={draft.postcode} onChange={e => setDraft(d => ({ ...d, postcode: e.target.value.replace(/\D/g, '') }))} />
                  <input className={input} placeholder="City" value={draft.city} onChange={e => setDraft(d => ({ ...d, city: e.target.value }))} />
                  <input className={input} placeholder="State" value={draft.state} onChange={e => setDraft(d => ({ ...d, state: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(null)} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500">Cancel</button>
                  <button type="button" onClick={() => { void save(r.rider_id); }} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Link for J&T staff */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-500">Link for J&amp;T staff</p>
        <button type="button" onClick={createLink} disabled={creating}
          className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-3 rounded-2xl active:scale-[0.98] transition disabled:opacity-50">
          <Link2 className="w-4 h-4" /> {creating ? 'Creating…' : 'Create J&T link (3 days)'}
        </button>

        {newLink && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-emerald-700 m-0">Copy this link now — it is shown only once.</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 font-mono text-[11px] text-slate-700 break-all">{newLink}</span>
              <button type="button" onClick={async () => { if (await copyToClipboard(newLink)) { setCopied(true); showToast('Link copied ✓'); } }}
                className="h-10 px-3 flex items-center gap-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 text-xs font-semibold shrink-0">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {links.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold m-0 ${l.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {l.active ? 'Active' : l.revoked_at ? 'Revoked' : 'Expired'}
                  </p>
                  <p className="text-[11px] text-slate-500 m-0">Created {fmt(l.created_at)} · {l.active ? 'expires' : 'ended'} {fmt(l.revoked_at ?? l.expires_at)}</p>
                </div>
                {l.active && (
                  <button type="button" onClick={() => revoke(l)}
                    className="h-9 px-3 flex items-center gap-1 rounded-lg border border-red-100 text-red-500 text-[11px] font-semibold shrink-0">
                    <Ban className="w-3.5 h-3.5" /> Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tracking emails to customers */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-slate-500">Tracking emails</p>
        <p className="text-[11px] text-slate-500 m-0">
          {trackInfo
            ? <>{trackInfo.pending} waiting to send · {trackInfo.emailed} already emailed{trackInfo.no_email > 0 ? <> · {trackInfo.no_email} without an email address (skipped)</> : null}</>
            : 'Loading…'}
        </p>
        <button type="button" onClick={sendTrackingEmails} disabled={sendingEmails || !trackInfo?.pending}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold text-sm py-3 rounded-2xl active:scale-[0.98] transition disabled:opacity-40">
          <Mail className="w-4 h-4" /> {sendingEmails ? 'Sending… (about 1 second each)' : `Send tracking emails (${trackInfo?.pending ?? 0})`}
        </button>
      </div>

      <button type="button" onClick={resetAll}
        className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-600 font-semibold text-xs py-2.5 rounded-2xl active:scale-[0.98] transition">
        <RotateCcw className="w-3.5 h-3.5" /> Reset all copy progress
      </button>
    </div>
  );
}
