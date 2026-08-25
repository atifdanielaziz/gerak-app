import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { X, Car, Bike, ShieldCheck, ExternalLink, Phone, ContactRound, History } from 'lucide-react';
import { WaBtn } from '../../../lib/whatsapp';
import { jubahLocationLabel, universityKeyFromCampus } from '../../../lib/universities';
import { DigitalProfileCard } from '../../../components/DigitalProfileCard';
import { receiptStatus } from '../../../lib/receiptStatus';
import { getSignedUrl } from '../../../lib/jubahDocs';

export interface ProfileUser {
  id: string;
  name: string;
  gerak_id: string;
  role: string;
  campus: string;
  email: string;
  status: string;
  phone: string;
  avatar_url?: string;
  can_drive?: boolean;
  can_rent?: boolean;
  can_transport?: boolean;
  can_daily?: boolean;
  can_robe?: boolean;
  receipt_gate_exempt?: boolean;
  matric_no?: string;
  ic_number?: string;
  ic_url?: string;
  license_url?: string;
  license_storage_path?: string;
  vehicle?: string;
  plate_number?: string;
  docs_status?: string;
  docs_reject_reason?: string | null;
  fee_receipt_verified?: boolean;
  fee_receipt_url?: string;
  fee_receipt_expiry?: string | null;
  fee_receipt_reject_reason?: string;
  campus_status?: 'in_campus' | 'out_campus';
  last_seen_at?: string | null;
  has_active_job?: boolean;
}

const RECEIPT_STATUS_STYLE = {
  verified: 'text-emerald-600',
  expired:  'text-red-500',
  rejected: 'text-orange-500',
  pending:  'text-amber-500',
};

// Staff/driver/rider profile detail sheet — shared by the Users tab AND the
// Receipts tab (tapping a receipt row opens the same sheet for that driver),
// so this stays a standalone component rather than living inside UsersTab.
interface ReceiptHistoryRow {
  id: string;
  storage_path: string;
  amount: string | null;
  submitted_date: string | null;
  expiry: string | null;
  verified: boolean;
  reject_reason: string | null;
  archived_at: string;
}

export const ProfileSheet: React.FC<{ u: ProfileUser; onClose: () => void; showToast?: (msg: string) => void }> = ({ u, onClose, showToast }) => {
  const [extra, setExtra] = useState<Partial<ProfileUser>>({});
  const [loading, setLoading] = useState(true);
  const [savingCampusStatus, setSavingCampusStatus] = useState(false);
  const [showDigitalCard, setShowDigitalCard] = useState(false);
  const [receiptHistory, setReceiptHistory] = useState<ReceiptHistoryRow[]>([]);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('profiles')
      .select('matric_no, ic_number, ic_url, license_url, license_storage_path, vehicle, plate_number, docs_status, fee_receipt_verified, fee_receipt_url, fee_receipt_expiry, fee_receipt_reject_reason, campus_status, avatar_url')
      .eq('id', u.id)
      .single()
      .then(({ data }) => { if (data) setExtra(data); setLoading(false); });

    // Driver-only, same gate as the Payment Status row below — riders/
    // admins never have fee receipts to begin with.
    if (u.role === 'driver') {
      supabase.from('fee_receipt_history')
        .select('id, storage_path, amount, submitted_date, expiry, verified, reject_reason, archived_at')
        .eq('user_id', u.id)
        .order('archived_at', { ascending: false })
        .then(({ data }) => setReceiptHistory(data ?? []));
    }
  }, [u.id, u.role]);

  // storage_path is a bare path, not a link — signed URLs from the
  // original upload expire after 30 days, long before 3 months of history
  // would be useful, so a fresh one is generated only when actually
  // viewed instead of stored alongside the row.
  const viewHistoryReceipt = async (row: ReceiptHistoryRow) => {
    setViewingHistoryId(row.id);
    const { url, error, notFound } = await getSignedUrl('driver-receipts', row.storage_path, 60 * 10);
    setViewingHistoryId(null);
    if (error || !url) { showToast?.(notFound ? 'This file no longer exists.' : 'Could not open this receipt.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // license_url is a Storage signed link generated once at upload time — it
  // expires (365 days) and, once it does, is a permanently dead link.
  // Generate a fresh one on demand from the stable storage path instead.
  const [viewingLicense, setViewingLicense] = useState(false);
  const viewLicense = async () => {
    if (!merged.license_storage_path) { window.open(merged.license_url, '_blank', 'noopener,noreferrer'); return; }
    setViewingLicense(true);
    const { url, error, notFound } = await getSignedUrl('driver-documents', merged.license_storage_path, 60 * 10);
    setViewingLicense(false);
    if (error || !url) { showToast?.(notFound ? 'This file no longer exists.' : 'Could not open this document.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSetCampusStatus = async (status: 'in_campus' | 'out_campus') => {
    if (status === extra.campus_status || savingCampusStatus) return;
    setSavingCampusStatus(true);
    const { data, error } = await supabase.rpc('set_staff_campus_status', { p_user_id: u.id, p_status: status });
    setSavingCampusStatus(false);
    if (error || !data?.success) { showToast?.(data?.error ?? 'Failed to update status.'); return; }
    setExtra(prev => ({ ...prev, campus_status: status }));
  };

  const merged = { ...u, ...extra };
  const isDriverOrRider = u.role === 'driver' || u.role === 'rider';

  const avatarBg =
    u.role === 'superadmin' ? 'bg-violet-600 shadow-violet-200' :
    u.role === 'admin'      ? 'bg-blue-600 shadow-blue-200'     :
    u.role === 'rider'      ? 'bg-amber-500 shadow-amber-200'   :
                              'bg-emerald-600 shadow-emerald-200';
  const roleBadge =
    u.role === 'superadmin' ? 'bg-violet-50 border-violet-100 text-violet-600' :
    u.role === 'admin'      ? 'bg-blue-50 border-blue-100 text-blue-600'       :
    u.role === 'rider'      ? 'bg-amber-50 border-amber-100 text-amber-600'    :
                              'bg-emerald-50 border-emerald-100 text-emerald-600';

  const Row = ({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) => (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0 gap-2">
      <span className="text-xs font-normal text-slate-400 shrink-0 pt-0.5">{label}</span>
      <div className="text-right flex items-center gap-1.5 flex-wrap justify-end">
        {children ?? <span className={`text-xs font-semibold ${value ? 'text-slate-700' : 'text-slate-300'}`}>{value || '—'}</span>}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onPointerDown={(e) => { e.preventDefault(); onClose(); }}
    >
      {showDigitalCard && <DigitalProfileCard profile={{
        name: u.name, role: u.role, phone: u.phone, vehicle: merged.vehicle, plateNumber: merged.plate_number,
        status: u.status, avatarUrl: merged.avatar_url, gerakId: u.gerak_id,
        canDrive: u.can_drive, canRent: u.can_rent, canTransport: u.can_transport,
      }} onClose={() => setShowDigitalCard(false)} />}
      <div
        className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0">
          <p className="text-sm font-semibold text-slate-700">Staff Profile</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >

          {/* Avatar + name */}
          <div className="flex flex-col items-center pb-5 gap-2">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${avatarBg}`}>
              {u.role === 'driver' ? <Car className="w-9 h-9 text-white" /> :
               u.role === 'rider'  ? <Bike className="w-9 h-9 text-white" />  :
               <ShieldCheck className="w-9 h-9 text-white" />}
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-slate-800">{u.name}</p>
              <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${roleBadge}`}>
                <ShieldCheck className="w-3 h-3" /> {u.role}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Identity */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                <Row label="Gerak ID"><span className="text-xs font-semibold text-primary">{u.gerak_id}</span></Row>
                <Row label="Campus" value={jubahLocationLabel(universityKeyFromCampus(u.campus) ?? '', u.campus)} />
                <Row label="Matric No." value={merged.matric_no} />
                <Row label="IC Number" value={merged.ic_number} />
                <Row label="Status">
                  <span className={`text-xs font-semibold ${u.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{u.status}</span>
                </Row>
                {/* Monthly driver fee receipt — separate from account Status
                    above (that's only whether the account is suspended).
                    Driver-only: riders/admins don't have this fee. Same
                    verified/expired/rejected/pending logic as ReceiptsTab. */}
                {u.role === 'driver' && (
                  <Row label="Payment Status">
                    <span className={`text-xs font-semibold capitalize ${RECEIPT_STATUS_STYLE[receiptStatus(merged)]}`}>
                      {receiptStatus(merged)}
                    </span>
                  </Row>
                )}
                {/* Purely informational — separate from Status above and
                    unrelated to ride availability; just where the driver
                    physically is. Driver sets it themselves day-to-day
                    (Driver Hub); this is the admin override for corrections. */}
                <Row label="Campus Presence">
                  <div className="flex bg-slate-100 border border-slate-200 rounded-full p-0.5 gap-0.5">
                    {(['in_campus', 'out_campus'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => handleSetCampusStatus(s)}
                        disabled={savingCampusStatus}
                        className="relative rounded-full transition-transform transform-gpu active:scale-95 disabled:opacity-50"
                      >
                        <span className="block px-2 py-1 text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                          {s === 'in_campus' ? 'In' : 'Out'}
                        </span>
                        <span className={`absolute inset-0 flex items-center justify-center px-2 py-1 rounded-full text-[10px] font-semibold text-white whitespace-nowrap transition-opacity duration-150 ${
                          s === 'in_campus' ? 'bg-emerald-500' : 'bg-slate-500'
                        } ${(extra.campus_status ?? 'in_campus') === s ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          {s === 'in_campus' ? 'In' : 'Out'}
                        </span>
                      </button>
                    ))}
                  </div>
                </Row>
              </div>

              {/* Contact */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                <Row label="Email" value={u.email} />
                <Row label="Phone" value={u.phone} />
              </div>

              {/* Vehicle — drivers only */}
              {u.role === 'driver' && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                  <Row label="Vehicle" value={merged.vehicle} />
                  <Row label="Plate" value={merged.plate_number} />
                </div>
              )}

              {/* Documents */}
              {isDriverOrRider && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                  <Row label="Docs Status">
                    <span className={`text-xs font-semibold capitalize ${
                      merged.docs_status === 'verified' ? 'text-emerald-600' :
                      merged.docs_status === 'rejected' ? 'text-red-500' :
                      merged.docs_status === 'pending'  ? 'text-amber-500' : 'text-slate-400'
                    }`}>{merged.docs_status || 'none'}</span>
                  </Row>
                  <Row label="License">
                    {merged.license_url
                      ? <button type="button" onClick={viewLicense} disabled={viewingLicense}
                          className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg active:scale-95 transition flex items-center gap-1 disabled:opacity-50">
                          <ExternalLink className="w-3 h-3" /> {viewingLicense ? 'Opening…' : 'View'}
                        </button>
                      : <span className="text-xs font-semibold text-slate-300">Not uploaded</span>}
                  </Row>
                </div>
              )}

              {/* Receipt History — up to the 3 most recent receipts this
                  one replaced, kept once "current" moves on (see the
                  profiles trigger). Absent entirely until there's actually
                  something to show, rather than an empty card. */}
              {u.role === 'driver' && receiptHistory.length > 0 && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mb-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-2">
                    <History className="w-3.5 h-3.5" /> Receipt History
                  </p>
                  <div className="flex flex-col gap-2">
                    {receiptHistory.map(h => (
                      <div key={h.id} className="flex items-center justify-between gap-2 bg-white border border-slate-100 rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {h.submitted_date || new Date(h.archived_at).toLocaleDateString('en-MY')}
                            {h.amount ? ` · ${h.amount}` : ''}
                          </p>
                          <p className={`text-[10px] font-semibold capitalize mt-0.5 ${
                            h.verified ? 'text-emerald-600' : h.reject_reason ? 'text-orange-500' : 'text-amber-500'
                          }`}>
                            {h.verified ? 'verified' : h.reject_reason ? 'rejected' : 'pending'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => viewHistoryReceipt(h)}
                          disabled={viewingHistoryId === h.id}
                          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg active:scale-95 transition disabled:opacity-50"
                        >
                          <ExternalLink className="w-3 h-3" /> {viewingHistoryId === h.id ? 'Opening…' : 'View'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: digital card + contact actions */}
        <div className="px-4 pt-3 pb-6 flex items-center gap-3 shrink-0 border-t border-slate-100">
          <button type="button" onPointerDown={event => { event.preventDefault(); setShowDigitalCard(true); }} className="w-12 flex items-center justify-center bg-white border border-slate-100 text-slate-700 py-3.5 rounded-2xl active:scale-[0.98] transition">
            <ContactRound className="w-4 h-4" />
          </button>
          {u.phone && <>
            <a href={`tel:${u.phone}`}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition">
              <Phone className="w-4 h-4" /> Call
            </a>
            <WaBtn phone={u.phone} />
          </>}
        </div>
      </div>
    </div>
  );
};
