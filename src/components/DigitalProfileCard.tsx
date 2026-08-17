import { useEffect, useMemo, useState } from 'react';
import { CarFront, Phone, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import { WaBtn } from '../lib/whatsapp';

export interface DigitalProfileData {
  name: string;
  role: string;
  phone: string;
  vehicle?: string | null;
  status?: string | null;
  avatarUrl?: string | null;
  gerakId?: string | null;
  canDrive?: boolean;
  canRent?: boolean;
  canTransport?: boolean;
}

const escapeVCard = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

export const digitalRoleLabel = (profile: DigitalProfileData) => {
  const role = profile.role.toLowerCase();
  if (role === 'superadmin') return profile.canDrive ? 'Superadmin (Driver)' : 'Superadmin';
  if (role === 'admin') return profile.canDrive ? 'Admin (Driver)' : 'Admin';
  if (role === 'driver') return 'Driver';
  if (role === 'rider') return 'Rider';
  if (profile.canRent) return 'Rental Owner';
  if (profile.canTransport) return 'Transporter';
  if (profile.canDrive) return 'Driver';
  return 'Customer';
};

export const DigitalProfileCard: React.FC<{ profile: DigitalProfileData; onClose: () => void }> = ({ profile, onClose }) => {
  const [qrUrl, setQrUrl] = useState('');
  const roleLabel = digitalRoleLabel(profile);
  const isProvider = roleLabel !== 'Customer';
  const initial = (profile.name?.[0] || 'G').toUpperCase();
  const vCard = useMemo(() => [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${escapeVCard(profile.name || 'Gerak User')}`,
    `ORG:Gerak;${escapeVCard(roleLabel)}`,
    profile.phone ? `TEL;TYPE=CELL:${escapeVCard(profile.phone)}` : '',
    profile.gerakId ? `NOTE:Gerak ID ${escapeVCard(profile.gerakId)}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\n'), [profile.gerakId, profile.name, profile.phone, roleLabel]);

  useEffect(() => {
    let current = true;
    QRCode.toDataURL(vCard, { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then(url => { if (current) setQrUrl(url); })
      .catch(() => { if (current) setQrUrl(''); });
    return () => { current = false; };
  }, [vCard]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]" onPointerDown={onClose}>
      <section className="w-full max-w-[420px] max-h-[calc(100dvh-2rem)] overflow-y-auto no-scrollbar bg-white rounded-3xl shadow-2xl animate-slide-up" onPointerDown={event => event.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0"><img src="/gerak-symbol.png" alt="Gerak" className="w-7 h-7 object-contain shrink-0" /><h2 className="font-semibold text-slate-900 truncate">Digital Profile Card</h2></div>
          <button type="button" onPointerDown={event => { event.preventDefault(); onClose(); }} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"><X className="w-5 h-5" /></button>
        </header>

        <div className="px-5 py-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          <div className="border border-slate-100 rounded-3xl p-5">
            <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.name} className="w-20 h-20 rounded-full object-cover border border-slate-100 shrink-0" /> : <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center shrink-0"><span className="text-2xl font-black text-white">{initial}</span></div>}
              <div className="min-w-0 flex-1"><p className="text-lg font-semibold text-slate-900 leading-tight break-words">{profile.name || 'Gerak User'}</p><p className="text-sm text-primary font-semibold mt-1">{roleLabel}</p>{profile.gerakId && <p className="text-xs text-slate-400 mt-1">{profile.gerakId}</p>}</div>
              <div className="shrink-0 text-center">
                {qrUrl ? <img src={qrUrl} alt={`${profile.name} contact QR`} className="w-20 h-20 object-contain" /> : <div className="w-20 h-20 bg-slate-50 rounded-xl animate-pulse" />}
                <span className="flex items-center justify-center gap-1 text-[10px] font-normal text-slate-400 mt-1"><QrCode className="w-3 h-3" /> Scan</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-slate-400"><Phone className="w-4 h-4" /> H/P Number</span><span className="flex items-center gap-2 text-sm font-semibold text-slate-800 text-right">{profile.phone || '—'}{profile.phone && <WaBtn phone={profile.phone} />}</span></div>
              {isProvider && <div className="py-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-slate-400"><CarFront className="w-4 h-4" /> Car Type</span><span className="text-sm font-semibold text-slate-800 text-right">{profile.vehicle || '—'}</span></div>}
              {isProvider && <div className="py-3 flex items-center justify-between gap-3"><span className="text-sm text-slate-400">Status</span><span className={`text-sm font-semibold capitalize ${profile.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>{profile.status || 'active'}</span></div>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
