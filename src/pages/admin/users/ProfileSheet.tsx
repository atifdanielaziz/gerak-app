import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { X, Car, Bike, ShieldCheck, ExternalLink, Phone } from 'lucide-react';
import { WaBtn, WaIcon, toWa } from '../../../lib/whatsapp';

export interface ProfileUser {
  id: string;
  name: string;
  gerak_id: string;
  role: string;
  campus: string;
  email: string;
  status: string;
  phone: string;
  can_drive?: boolean;
  can_rent?: boolean;
  can_daily?: boolean;
  can_robe?: boolean;
  receipt_gate_exempt?: boolean;
  matric_no?: string;
  ic_number?: string;
  ic_url?: string;
  license_url?: string;
  vehicle?: string;
  plate_number?: string;
  docs_status?: string;
  fee_receipt_verified?: boolean;
}

// Staff/driver/rider profile detail sheet — shared by the Users tab AND the
// Receipts tab (tapping a receipt row opens the same sheet for that driver),
// so this stays a standalone component rather than living inside UsersTab.
export const ProfileSheet: React.FC<{ u: ProfileUser; onClose: () => void }> = ({ u, onClose }) => {
  const [extra, setExtra] = useState<Partial<ProfileUser>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('profiles')
      .select('matric_no, ic_number, ic_url, license_url, vehicle, plate_number, docs_status, fee_receipt_verified')
      .eq('id', u.id)
      .single()
      .then(({ data }) => { if (data) setExtra(data); setLoading(false); });
  }, [u.id]);

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

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-4">

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
                <Row label="Campus" value={`UMPSA ${u.campus}`} />
                <Row label="Matric No." value={merged.matric_no} />
                <Row label="IC Number" value={merged.ic_number} />
                <Row label="Status">
                  <span className={`text-xs font-semibold ${u.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{u.status}</span>
                </Row>
              </div>

              {/* Contact */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                <Row label="Email" value={u.email} />
                <Row label="Phone">
                  <span className="text-xs font-semibold text-slate-700">{u.phone || '—'}</span>
                  {u.phone && (
                    <a href={`https://wa.me/${toWa(u.phone)}`} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()} className="text-[#25D366] active:scale-90 transition">
                      <WaIcon className="w-3.5 h-3.5" />
                    </a>
                  )}
                </Row>
              </div>

              {/* Vehicle — drivers only */}
              {u.role === 'driver' && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 mb-3">
                  <Row label="Vehicle" value={merged.vehicle} />
                  <Row label="Plate" value={merged.plate_number} />
                  <Row label="Receipt">
                    <span className={`text-xs font-semibold ${merged.fee_receipt_verified ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {merged.fee_receipt_verified ? 'Verified ✓' : 'Pending'}
                    </span>
                  </Row>
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
                  <Row label="IC Photo">
                    {merged.ic_url
                      ? <a href={merged.ic_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg active:scale-95 transition flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      : <span className="text-xs font-semibold text-slate-300">Not uploaded</span>}
                  </Row>
                  <Row label="License">
                    {merged.license_url
                      ? <a href={merged.license_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg active:scale-95 transition flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      : <span className="text-xs font-semibold text-slate-300">Not uploaded</span>}
                  </Row>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: Call + WhatsApp */}
        {u.phone && (
          <div className="px-4 pt-3 pb-6 flex gap-3 shrink-0 border-t border-slate-100">
            <a href={`tel:${u.phone}`}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition">
              <Phone className="w-4 h-4" /> Call
            </a>
            <WaBtn phone={u.phone} />
          </div>
        )}
      </div>
    </div>
  );
};
