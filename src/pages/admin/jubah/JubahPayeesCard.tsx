import { useCallback, useState } from 'react';
import { Wallet, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useApp } from '../../../context/AppContext';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { JubahQrButton } from '../../../components/JubahQrButton';
import { payeeQrPath } from '../../../lib/jubahPayee';

type PayeeRow = {
  rider_id: string; rider_name: string; is_payee: boolean;
  bank_name: string | null; account_number: string | null; account_holder: string | null; is_active: boolean;
};

const emptyDraft = { bank: '', account: '', holder: '', active: true };

// Superadmin-only: riders (owners) whose customers pay straight into their
// own account. Every other rider's customers pay the shared Payment Bank
// Details above. Writes go through superadmin_set/remove_jubah_payee
// (server re-checks superadmin + validates the account fields); the QR is
// stored at jubah-qr/payees/<rider>.jpg, superadmin-only write by storage RLS.
export function JubahPayeesCard({ active, showToast }: { active: boolean; showToast: (msg: string) => void }) {
  const { showConfirmModal } = useApp();
  const [rows, setRows] = useState<PayeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('superadmin_list_jubah_payees');
    setLoading(false);
    if (error) { showToast(error.message); return; }
    setRows((data as PayeeRow[]) ?? []);
  }, [showToast]);
  useLoadOnActive(active, load);

  const startEdit = (r: PayeeRow) => {
    setEditing(r.rider_id);
    setDraft(r.is_payee
      ? { bank: r.bank_name ?? '', account: r.account_number ?? '', holder: r.account_holder ?? '', active: r.is_active }
      : { ...emptyDraft, holder: r.rider_name });
  };

  const save = async (riderId: string) => {
    setSaving(true);
    const { data, error } = await supabase.rpc('superadmin_set_jubah_payee', {
      p_rider_id: riderId, p_bank_name: draft.bank, p_account_number: draft.account,
      p_account_holder: draft.holder, p_is_active: draft.active,
    });
    setSaving(false);
    if (error || !data?.success) { showToast(data?.error ?? error?.message ?? 'Failed to save.'); return; }
    showToast('Payment account saved ✓');
    setEditing(null);
    void load();
  };

  const remove = (r: PayeeRow) => showConfirmModal({
    title: 'Remove direct payment?',
    message: `New customers who pick ${r.rider_name} will pay the shared account instead. Existing bookings keep the account they were given.`,
    confirmLabel: 'REMOVE',
    onConfirm: async () => {
      const { data, error } = await supabase.rpc('superadmin_remove_jubah_payee', { p_rider_id: r.rider_id });
      if (error || !data?.success) { showToast(data?.error ?? error?.message ?? 'Failed to remove.'); return; }
      showToast('Direct payment removed.');
      void load();
    },
  });

  const input = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold text-slate-700 focus:outline-none focus:border-primary transition w-full';

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
        <Wallet className="w-4 h-4" /> Rider Payment Accounts
      </h3>
      <p className="text-xs text-slate-400 font-semibold -mt-1.5">
        Customers who pick one of these riders pay into that rider's own account. Everyone else pays the Payment Bank Details above.
      </p>

      {loading && <div className="flex justify-center py-4"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>}

      {!loading && rows.map(r => (
        <div key={r.rider_id} className="border border-slate-100 rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{r.rider_name}</p>
              {r.is_payee
                ? <p className={`text-[11px] font-semibold ${r.is_active ? 'text-emerald-600' : 'text-amber-600'}`}>{r.is_active ? 'Paid directly' : 'Paused — shared account used'}</p>
                : <p className="text-[11px] text-slate-400">Uses shared account</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {r.is_payee && <JubahQrButton canManage path={payeeQrPath(r.rider_id)} showToast={showToast} />}
              {editing !== r.rider_id && (
                <button type="button" onClick={() => startEdit(r)} aria-label={r.is_payee ? 'Edit account' : 'Set up direct payment'}
                  className="h-11 px-3 flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-500 text-[11px] font-semibold active:scale-95 transition">
                  <Pencil className="w-3.5 h-3.5" /> {r.is_payee ? 'Edit' : 'Set up'}
                </button>
              )}
              {r.is_payee && editing !== r.rider_id && (
                <button type="button" onClick={() => remove(r)} aria-label="Remove direct payment"
                  className="w-11 h-11 flex items-center justify-center rounded-lg border border-red-100 text-red-400 active:scale-95 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {r.is_payee && editing !== r.rider_id && (
            <p className="text-[11px] text-slate-500">{r.bank_name} · <span className="font-mono">{r.account_number}</span> · {r.account_holder}</p>
          )}

          {editing === r.rider_id && (
            <div className="flex flex-col gap-2 pt-1" style={{ fontSize: '13px' }}>
              <input className={input} placeholder="Bank name" value={draft.bank} onChange={e => setDraft(d => ({ ...d, bank: e.target.value }))} />
              <input className={`${input} font-mono`} placeholder="Account number" inputMode="numeric" value={draft.account} onChange={e => setDraft(d => ({ ...d, account: e.target.value }))} />
              <input className={input} placeholder="Account holder" value={draft.holder} onChange={e => setDraft(d => ({ ...d, holder: e.target.value }))} />
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))} />
                Active (customers pay this account)
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500">Cancel</button>
                <button type="button" onClick={() => { void save(r.rider_id); }} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
              {!r.is_payee && <p className="text-[11px] text-slate-400">After saving, tap the QR button to upload this rider's payment QR.</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
