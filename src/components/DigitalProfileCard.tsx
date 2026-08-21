import { CarFront, Hash, IdCard, Phone, ShieldCheck, User, X } from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';

export interface DigitalProfileData {
  name: string;
  role: string;
  phone: string;
  vehicle?: string | null;
  plateNumber?: string | null;
  status?: string | null;
  avatarUrl?: string | null;
  gerakId?: string | null;
  canDrive?: boolean;
  canRent?: boolean;
  canTransport?: boolean;
}

export const digitalRoleLabel = (profile: DigitalProfileData) => {
  const role = profile.role.toLowerCase();
  if (role === 'superadmin') return profile.canDrive ? 'Superadmin Driver' : 'Superadmin';
  if (role === 'admin') return profile.canDrive ? 'Admin Driver' : 'Admin';
  if (role === 'driver') return 'Driver';
  if (role === 'rider') return 'Rider';
  if (profile.canRent) return 'Rental Owner';
  if (profile.canTransport) return 'Transporter';
  if (profile.canDrive) return 'Driver';
  return 'Customer';
};

const InfoRow = ({ icon: Icon, label, value, accent = false }: {
  icon: typeof User;
  label: string;
  value?: string | null;
  accent?: boolean;
}) => (
  <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 last:border-b-0">
    <span className="w-8 h-8 rounded-xl border border-slate-100 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-slate-400" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-normal text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold ${accent ? 'text-emerald-600' : 'text-slate-800'}`}>
        {value || '—'}
      </p>
    </div>
  </div>
);

export const DigitalProfileCard: React.FC<{ profile: DigitalProfileData; onClose: () => void }> = ({ profile, onClose }) => {
  const roleLabel = digitalRoleLabel(profile);
  const isProvider = roleLabel !== 'Customer';
  const initial = (profile.name?.[0] || 'G').toUpperCase();
  const isActive = (profile.status || 'active').toLowerCase() === 'active';

  return (
    <div
      className="fixed inset-x-0 top-[calc(5rem+env(safe-area-inset-top))] bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[100] flex items-center justify-center px-4 py-4 bg-black/50 backdrop-blur-[2px]"
      onPointerDown={(event) => { event.preventDefault(); onClose(); }}
    >
      <section
        className="w-full max-w-[420px] max-h-full bg-white rounded-3xl shadow-2xl animate-slide-up flex flex-col overflow-hidden"
        onPointerDown={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <h2 className="text-sm font-semibold text-slate-800">Profile Card</h2>
          <button
            type="button"
            onPointerDown={event => { event.preventDefault(); onClose(); }}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          <div className="flex flex-col items-center px-5 pb-3 gap-1.5">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="w-[4.5rem] h-[4.5rem] rounded-full object-cover border border-slate-100" />
            ) : (
              <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-emerald-600 flex items-center justify-center">
                {isProvider ? <CarFront className="w-8 h-8 text-white" /> : <span className="text-2xl font-black text-white">{initial}</span>}
              </div>
            )}
            <p className="mt-1 text-lg font-semibold text-slate-900 text-center leading-tight">{profile.name || 'Gerak User'}</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
              <ShieldCheck className="w-3.5 h-3.5" /> Gerak {roleLabel}
            </span>
          </div>

          <div className="mx-5 mb-3 rounded-2xl border border-slate-100 overflow-hidden">
            <InfoRow icon={User} label="Name" value={profile.name} />
            <InfoRow icon={IdCard} label="Gerak ID" value={profile.gerakId} accent />
            <InfoRow icon={Phone} label="Phone" value={profile.phone} />
            {isProvider && <InfoRow icon={CarFront} label="Car Type" value={profile.vehicle} />}
            {isProvider && <InfoRow icon={Hash} label="Plate Number" value={profile.plateNumber} />}
            {isProvider && <InfoRow icon={ShieldCheck} label="Status" value={isActive ? 'Active' : profile.status} accent={isActive} />}
          </div>
        </div>

        {profile.phone && (
          <footer className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-3">
            <a href={`tel:${profile.phone}`} className="flex-1 h-11 rounded-2xl bg-slate-800 text-white flex items-center justify-center gap-2 text-sm font-semibold active:scale-[0.99] transition-transform">
              <Phone className="w-4 h-4" /> Call
            </a>
            <WaBtn phone={profile.phone} />
          </footer>
        )}
      </section>
    </div>
  );
};
