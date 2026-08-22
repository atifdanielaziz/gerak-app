import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { ShieldCheck, ShieldOff, AlertCircle, FileImage, RefreshCw, ExternalLink, BarChart3, Plus, Minus, Clock3, CalendarX2 } from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { type ProfileUser } from '../users/ProfileSheet';
import { NativeSelect } from '../../../components/NativeSelect';
import { useAxisLockedScroll } from '../../../hooks/useAxisLockedScroll';
import { UNIVERSITY_MAP } from '../../../lib/universities';

interface DriverReceipt {
  id: string;
  name: string;
  gerak_id: string;
  campus: string;
  email: string;
  phone: string;
  status: string;
  fee_receipt_url: string;
  fee_receipt_verified: boolean;
  fee_receipt_auto_verified: boolean;
  fee_receipt_amount: string;
  fee_receipt_date: string;
  fee_receipt_expiry: string | null;
  fee_receipt_reject_reason: string;
}

const RECEIPT_STATUS_STYLE = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired:  'bg-red-50 text-red-600 border-red-200',
  rejected: 'bg-orange-50 text-orange-600 border-orange-200',
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
};

export interface ReceiptsTabHandle {
  reload: () => void;
}

interface ReceiptsTabProps {
  active: boolean;
  showToast: (msg: string) => void;
  onViewProfile: (u: ProfileUser) => void;
  onModalOpenChange: (open: boolean) => void;
  universityKey: string;
}

// Driver/rider monthly fee receipt review + the app-wide receipt gate
// master toggle — split out of AdminHome.tsx. Not the same "receipt" as
// the Jubah booking payment receipt (receiptModal in AdminHome, opened
// from the Jubah tab) — same word, different feature, kept separate.
export const ReceiptsTab = forwardRef<ReceiptsTabHandle, ReceiptsTabProps>(function ReceiptsTab(
  { active, showToast, onViewProfile, onModalOpenChange, universityKey },
  ref
) {
  const receiptDirectoryScrollRef = useAxisLockedScroll<HTMLDivElement>();
  const [driverReceipts, setDriverReceipts] = useState<DriverReceipt[]>([]);
  // Real total vs driverReceipts.length, which is capped below — only used
  // to show "showing X of Y" if that cap is ever actually hit.
  const [driverReceiptsTotalCount, setDriverReceiptsTotalCount] = useState<number | null>(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'verified' | 'pending' | 'rejected' | 'expired'>('all');
  const [receiptRoleFilter, setReceiptRoleFilter] = useState<'driver' | 'rider'>('driver');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptGateOn, setReceiptGateOn] = useState(true);
  const [togglingReceiptGate, setTogglingReceiptGate] = useState(false);
  const [showGateMasterConfirm, setShowGateMasterConfirm] = useState(false);
  const [approvingReceipt, setApprovingReceipt] = useState<string | null>(null);
  const [rejectingReceipt, setRejectingReceipt] = useState<string | null>(null);
  const [overviewCollapsed, setOverviewCollapsed] = useState(true);

  useEffect(() => { onModalOpenChange(showGateMasterConfirm); }, [showGateMasterConfirm, onModalOpenChange]);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    const [{ data, count }, { data: setting }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, gerak_id, campus, email, phone, status, fee_receipt_url, fee_receipt_verified, fee_receipt_auto_verified, fee_receipt_amount, fee_receipt_date, fee_receipt_expiry, fee_receipt_reject_reason', { count: 'exact' })
        .eq('role', receiptRoleFilter)
        .in('campus', UNIVERSITY_MAP[universityKey]?.campuses ?? [])
        .order('name')
        .limit(1000),
      supabase.from('app_settings').select('value').eq('key', 'receipt_gate_active').single(),
    ]);
    setDriverReceiptsTotalCount(count ?? null);
    setDriverReceipts((data as DriverReceipt[]) ?? []);
    if (setting) setReceiptGateOn(setting.value === 'true');
    setReceiptsLoading(false);
  }, [receiptRoleFilter, universityKey]);

  useLoadOnActive(active, loadReceipts);
  useImperativeHandle(ref, () => ({ reload: loadReceipts }), [loadReceipts]);

  const handleToggleReceiptGate = async () => {
    setTogglingReceiptGate(true);
    const newVal = (!receiptGateOn).toString();
    await supabase.from('app_settings').update({ value: newVal }).eq('key', 'receipt_gate_active');
    setReceiptGateOn(!receiptGateOn);
    setTogglingReceiptGate(false);
    showToast(`Receipt gate ${!receiptGateOn ? 'enabled' : 'disabled'}.`);
  };

  const receiptStatus = (r: DriverReceipt): 'verified' | 'expired' | 'rejected' | 'pending' => {
    if (!r.fee_receipt_url) return 'pending';
    if (r.fee_receipt_verified && r.fee_receipt_expiry && new Date(r.fee_receipt_expiry) <= new Date()) return 'expired';
    if (r.fee_receipt_verified) return 'verified';
    if (r.fee_receipt_reject_reason) return 'rejected';
    return 'pending';
  };

  // Was recomputed raw on every render — memoized so a search keystroke
  // doesn't re-filter the full list synchronously each time.
  const filteredReceipts = useMemo(() => (receiptFilter === 'all'
    ? driverReceipts
    : driverReceipts.filter(r => receiptStatus(r) === receiptFilter)
  ).filter(r =>
    !receiptSearch.trim() ||
    r.name.toLowerCase().includes(receiptSearch.toLowerCase()) ||
    r.gerak_id.toLowerCase().includes(receiptSearch.toLowerCase())
  ), [driverReceipts, receiptFilter, receiptSearch]);

  const handleApproveReceipt = async (r: DriverReceipt) => {
    setApprovingReceipt(r.id);
    const { data } = await supabase.rpc('approve_driver_receipt', { p_user_id: r.id });
    setApprovingReceipt(null);
    if (data?.success === false) showToast(data.error ?? 'Failed to approve.');
    else { showToast(`${r.name} approved — active until end of month.`); loadReceipts(); }
  };

  const handleRejectReceipt = async (r: DriverReceipt) => {
    const reason = window.prompt(
      `Rejection reason for ${r.name}:`,
      'Receipt does not meet requirements. Please re-upload a valid RM25.00 bank transfer receipt paid on the 1st–3rd of the month.'
    );
    if (reason === null) return;
    setRejectingReceipt(r.id);
    const { data } = await supabase.rpc('reject_driver_receipt', {
      p_user_id: r.id,
      p_reason:  reason.trim() || 'Receipt rejected by admin.',
    });
    setRejectingReceipt(null);
    if (data?.success === false) showToast(data.error ?? 'Failed to reject.');
    else { showToast(`${r.name}'s receipt rejected.`); loadReceipts(); }
  };

  return (
    <>
      <div className="flex flex-col gap-4">

        {/* Master Receipt Gate Toggle — superadmin only */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${receiptGateOn ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              <ShieldCheck className={`w-5 h-5 ${receiptGateOn ? 'text-emerald-500' : 'text-slate-400'}`} />
            </div>
            <div>
              <p className="text-xs font-black text-slate-800">Receipt Gate</p>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                {receiptGateOn ? 'ON — monthly receipt required to be active' : 'OFF — everyone bypasses the receipt requirement'}
              </p>
            </div>
          </div>
          <button onClick={() => setShowGateMasterConfirm(true)} disabled={togglingReceiptGate}
            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 ${
              receiptGateOn
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
            {togglingReceiptGate ? '…' : receiptGateOn ? <><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />ON</> : <><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" />OFF</>}
          </button>
        </div>

        {/* Driver / Rider toggle */}
        <div className="hidden">
          {(['driver', 'rider'] as const).map(r => {
            const label = r === 'driver' ? 'Drivers' : 'Riders';
            // Two stacked layers instead of toggling bg-primary directly —
            // this WebView unreliably repaints colour changes; opacity
            // changes repaint reliably, so only opacity is toggled here.
            return (
              <button key={r} onPointerDown={e => { e.preventDefault(); setReceiptRoleFilter(r); }}
                className="relative flex-1 rounded-xl transition-transform">
                <span className="block py-2 text-xs font-semibold text-slate-400">{label}</span>
                <span
                  className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                    receiptRoleFilter === r ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Summary cards */}
        <div className="hidden">
          {(['all', 'verified', 'expired', 'pending'] as const).map(s => {
            const count = s === 'all'
              ? driverReceipts.length
              : driverReceipts.filter(r => receiptStatus(r) === s).length;
            const styles: Record<string, string> = {
              all:      'bg-white border-slate-100 text-slate-700',
              verified: 'bg-emerald-50 border-emerald-100 text-emerald-700',
              expired:  'bg-red-50 border-red-100 text-red-600',
              pending:  'bg-amber-50 border-amber-100 text-amber-700',
            };
            return (
              <button key={s} onPointerDown={e => { e.preventDefault(); setReceiptFilter(s); }}
                className={`rounded-2xl border p-3 flex flex-col items-center gap-1 transition-transform active:scale-95 ${styles[s]} ${
                  receiptFilter === s ? 'ring-2 ring-offset-1 ring-primary/40' : ''
                }`}
              >
                <span className="text-lg font-black leading-none">{count}</span>
                <span className="text-xs font-semibold uppercase tracking-wider capitalize">{s}</span>
              </button>
            );
          })}
        </div>

        <section className={`bg-white border border-slate-100 rounded-3xl ${overviewCollapsed ? 'p-3.5' : 'p-4'}`}>
          <div className={`flex items-center justify-between gap-3 ${overviewCollapsed ? '' : 'mb-4'}`}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><BarChart3 className="w-4 h-4 text-slate-400" /> Receipt Overview</h3>
            <button type="button" onPointerDown={e => { e.preventDefault(); setOverviewCollapsed(v => !v); }} aria-label={overviewCollapsed ? 'Expand receipt overview' : 'Minimize receipt overview'} className="w-7 h-7 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center active:scale-[0.99] transition-transform transform-gpu">{overviewCollapsed ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}</button>
          </div>
          {!overviewCollapsed && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{([
            ['All', driverReceipts.length, FileImage, 'bg-blue-50', 'text-blue-600'],
            ['Verified', driverReceipts.filter(r => receiptStatus(r) === 'verified').length, ShieldCheck, 'bg-emerald-50', 'text-emerald-600'],
            ['Expired', driverReceipts.filter(r => receiptStatus(r) === 'expired').length, CalendarX2, 'bg-red-50', 'text-red-500'],
            ['Pending', driverReceipts.filter(r => receiptStatus(r) === 'pending').length, Clock3, 'bg-amber-50', 'text-amber-600'],
          ] as const).map(([label, count, Icon, bg, color]) => <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4"><span className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg} ${color}`}><Icon className="w-4 h-4" /></span><p className="text-xs font-normal text-slate-400 mt-3">{label}</p><p className="text-xl font-semibold text-slate-800 mt-1">{count}</p></div>)}</div>}
        </section>

        {/* Search */}
        <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Find {receiptRoleFilter === 'driver' ? 'Driver' : 'Rider'}
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={receiptSearch}
              onChange={e => setReceiptSearch(e.target.value)}
              placeholder="Name or Gerak ID"
              style={{ fontSize: '12px' }}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
            />
            <button
              onClick={() => setReceiptSearch('')}
              disabled={!receiptSearch.trim()}
              className="px-3.5 bg-primary text-white font-semibold text-xs rounded-lg transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect value={receiptFilter} onChange={value => setReceiptFilter(value as typeof receiptFilter)} options={[{ value: 'all', label: 'All Statuses' }, { value: 'verified', label: 'Verified' }, { value: 'expired', label: 'Expired' }, { value: 'pending', label: 'Pending' }]} placeholder="Status" label="Status" />
            <NativeSelect value={receiptRoleFilter} onChange={value => setReceiptRoleFilter(value as typeof receiptRoleFilter)} options={[{ value: 'driver', label: 'Driver' }, { value: 'rider', label: 'Rider' }]} placeholder="Role" label="Role" />
          </div>
        </div>

        {driverReceiptsTotalCount !== null && driverReceiptsTotalCount > driverReceipts.length && (
          <p className="text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Showing {driverReceipts.length} of {driverReceiptsTotalCount} — use search to find someone else.
          </p>
        )}

        {/* Receipt list */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <FileImage className="w-4 h-4" /> {receiptRoleFilter === 'driver' ? 'Driver' : 'Rider'} Receipts
            </h3>
            <button onClick={loadReceipts}
              className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {!receiptsLoading && filteredReceipts.length > 0 && <div ref={receiptDirectoryScrollRef} className="table-scroll-x relative w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-none" style={{ contain: 'layout paint' }}>
            <div data-axis-y className="max-h-[420px] overflow-y-auto overflow-x-hidden overscroll-none no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="min-w-[68rem] w-full border-collapse text-left text-xs"><thead><tr className="border-b border-slate-100 text-slate-400">{['Name','Role','Gerak ID','Campus','Status','Amount','Paid','Expires','Receipt','Actions'].map(h => <th key={h} className="sticky top-0 z-10 bg-white py-2.5 pr-4 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead><tbody>
                {filteredReceipts.map(r => { const status = receiptStatus(r); const expires = r.fee_receipt_expiry ? new Date(r.fee_receipt_expiry).toLocaleDateString('en-MY') : '—'; return <tr key={r.id} onClick={() => onViewProfile({ id: r.id, name: r.name, gerak_id: r.gerak_id, role: receiptRoleFilter, campus: r.campus, email: r.email, status: r.status || 'active', phone: r.phone || '' })} className="border-b border-slate-100 last:border-b-0 cursor-pointer active:bg-slate-50">
                  <td className="py-3 pr-4 font-semibold text-slate-800 max-w-[14rem] truncate">{r.name}</td><td className="py-3 pr-4 text-slate-600 capitalize">{receiptRoleFilter}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{r.gerak_id}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{r.campus}</td><td className={`py-3 pr-4 font-semibold capitalize ${status === 'verified' ? 'text-emerald-600' : status === 'expired' ? 'text-red-500' : status === 'rejected' ? 'text-orange-600' : 'text-amber-600'}`}>{status}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{r.fee_receipt_amount || '—'}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{r.fee_receipt_date || '—'}</td><td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{expires}</td>
                  <td className="py-2 pr-4" onClick={e => e.stopPropagation()}>{r.fee_receipt_url ? <a href={r.fee_receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary font-semibold"><ExternalLink className="w-3.5 h-3.5" /> View</a> : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2" onClick={e => e.stopPropagation()}>{status === 'pending' && r.fee_receipt_url ? <div className="flex gap-1.5"><button type="button" onClick={() => handleApproveReceipt(r)} disabled={approvingReceipt === r.id || rejectingReceipt === r.id} className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 font-semibold disabled:opacity-50">Approve</button><button type="button" onClick={() => handleRejectReceipt(r)} disabled={approvingReceipt === r.id || rejectingReceipt === r.id} className="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-500 font-semibold disabled:opacity-50">Reject</button></div> : <span className="text-slate-300">—</span>}</td>
                </tr>; })}
              </tbody></table>
            </div>
          </div>}

          <div className={receiptsLoading || filteredReceipts.length === 0 ? "h-[120px] flex items-center justify-center" : "hidden"}>
          {receiptsLoading ? (
            <div className="flex justify-center py-8">
              <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            </div>
          ) : filteredReceipts.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold text-center py-6">No {receiptRoleFilter}s found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredReceipts.map(r => {
                const status  = receiptStatus(r);
                const expDate = r.fee_receipt_expiry ? new Date(r.fee_receipt_expiry) : null;
                const expLabel = expDate?.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
                return (
                  <div key={r.id}
                    className="border border-slate-100 rounded-2xl p-5 flex flex-col gap-2.5 cursor-pointer active:opacity-75 transition"
                    onClick={() => onViewProfile({ id: r.id, name: r.name, gerak_id: r.gerak_id, role: 'driver', campus: r.campus, email: r.email, status: r.status || 'active', phone: r.phone || '' })}
                  >

                    {/* Row 1: name + status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{r.name}</p>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">{r.gerak_id} · {r.campus}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full border uppercase flex items-center gap-1 ${RECEIPT_STATUS_STYLE[status]}`}>
                          {status === 'verified' ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldOff className="w-2.5 h-2.5" />}
                          {status}
                        </span>
                        {/* AI approved this without a human ever looking at it — worth
                            a visible marker so admins can spot-check rather than only
                            ever seeing the same "verified" pill a manual review gets. */}
                        {status === 'verified' && r.fee_receipt_auto_verified && (
                          <span title="Auto-approved by AI — not yet reviewed by a human" className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                            AI-verified
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row 2: receipt details */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-50 rounded-xl px-3 py-2">
                        <p className="text-slate-400 font-semibold mb-0.5">Amount</p>
                        <p className="font-semibold text-slate-700">{r.fee_receipt_amount || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-3 py-2">
                        <p className="text-slate-400 font-semibold mb-0.5">Paid</p>
                        <p className="font-semibold text-slate-700">{r.fee_receipt_date || '—'}</p>
                      </div>
                      <div className={`rounded-xl px-3 py-2 ${status === 'expired' ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <p className="text-slate-400 font-semibold mb-0.5">Expires</p>
                        <p className={`font-semibold ${status === 'expired' ? 'text-red-500' : 'text-slate-700'}`}>
                          {expLabel ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Reject reason */}
                    {status === 'rejected' && r.fee_receipt_reject_reason && (
                      <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 font-semibold">
                        Rejected: {r.fee_receipt_reject_reason}
                      </p>
                    )}

                    {/* View receipt link */}
                    {r.fee_receipt_url && (
                      <a href={r.fee_receipt_url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center gap-1.5 bg-primary/5 border border-primary/20 text-primary font-semibold text-xs py-2 rounded-xl hover:bg-primary/10 transition active:scale-95">
                        <ExternalLink className="w-3 h-3" /> View Receipt
                      </a>
                    )}

                    {/* Approve / Reject — pending receipts only */}
                    {status === 'pending' && r.fee_receipt_url && (
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleApproveReceipt(r)}
                          disabled={approvingReceipt === r.id || rejectingReceipt === r.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50"
                        >
                          {approvingReceipt === r.id
                            ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            : <><ShieldCheck className="w-3 h-3" /> Approve</>}
                        </button>
                        <button
                          onClick={() => handleRejectReceipt(r)}
                          disabled={approvingReceipt === r.id || rejectingReceipt === r.id}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 text-red-600 font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50"
                        >
                          {rejectingReceipt === r.id
                            ? <span className="w-3 h-3 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                            : <><ShieldOff className="w-3 h-3" /> Reject</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </div>

      {showGateMasterConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onPointerDown={(e) => { e.preventDefault(); setShowGateMasterConfirm(false); }}>
          <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-slide-up"
            onPointerDown={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <div className={`w-10 h-10 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
              receiptGateOn ? 'bg-amber-100' : 'bg-primary/10'
            }`}>
              {receiptGateOn
                ? <span className="text-amber-600 font-black text-sm">✕</span>
                : <span className="text-primary font-black text-sm">✓</span>}
            </div>
            <h3 className="text-sm font-black text-slate-800 text-center mb-1">
              {receiptGateOn ? 'Turn OFF Receipt Gate?' : 'Turn ON Receipt Gate?'}
            </h3>
            <p className="text-xs text-slate-400 font-semibold text-center mb-6">
              {receiptGateOn
                ? 'Every driver and rider will bypass the monthly receipt requirement and stay active regardless of payment.'
                : 'Drivers and riders will need a valid monthly receipt again to stay active.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowGateMasterConfirm(false)}
                className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-3 rounded-2xl transition active:scale-95">
                Cancel
              </button>
              <button onClick={() => { handleToggleReceiptGate(); setShowGateMasterConfirm(false); }}
                className={`flex-1 font-semibold text-xs py-3 rounded-2xl transition active:scale-95 text-white ${
                  receiptGateOn ? 'bg-amber-500' : 'bg-primary'
                }`}>
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
