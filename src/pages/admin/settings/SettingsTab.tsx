import { useEffect, useState } from 'react';
import { Car, GraduationCap, KeyRound, ShoppingBasket, Sliders, Truck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// Mirrors the Dashboard's Campus Modules tiles one-to-one — same order,
// icon and color per service, so Settings reads as "the switch for that
// tile" rather than a separately-maintained list.
const SERVICES = [
  { key: 'gerak_car_active', label: 'Gerak Car', description: 'Point-to-point campus travel', icon: Car, iconBg: 'bg-red-50', iconColor: 'text-primary' },
  { key: 'jubah_active', label: 'Jubah Delivery', description: 'Convocation robe delivery & returns', icon: GraduationCap, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
  { key: 'gerak_daily_active', label: 'Gerak Daily', description: 'Food & groceries delivery (Coming soon placeholder)', icon: ShoppingBasket, iconBg: 'bg-slate-100', iconColor: 'text-slate-400' },
  { key: 'gerak_rental_active', label: 'Gerak Rental', description: 'Rent campus vehicles by the hour', icon: KeyRound, iconBg: 'bg-purple-50', iconColor: 'text-purple-500' },
  { key: 'gerak_transporter_active', label: 'Gerak Transporter', description: 'Door-to-door motorcycle & small item transport', icon: Truck, iconBg: 'bg-orange-50', iconColor: 'text-orange-500' },
] as const;

interface Props {
  active: boolean;
  showToast: (message: string) => void;
}

// Generic on/off switch for a single app_settings row — same shape as
// Header.tsx's JubahAvailabilityToggle (optimistic flip, then confirmed
// against what the row actually saved as, reverting on failure), just
// parameterized so any boolean feature flag can reuse it here instead of
// each one growing its own copy.
function AppSettingToggle({ settingKey, showToast }: { settingKey: string; showToast: (message: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.from('app_settings').select('value').eq('key', settingKey).maybeSingle()
      .then(({ data }) => { if (mounted) { setEnabled(data?.value === 'true'); setLoaded(true); } });
    return () => { mounted = false; };
  }, [settingKey]);

  const toggle = async () => {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next);
    const { data, error } = await supabase.from('app_settings')
      .update({ value: String(next) })
      .eq('key', settingKey)
      .select('value')
      .maybeSingle();
    if (error || !data) {
      setEnabled(!next);
      showToast(error?.message ?? "Couldn't save — you may not have permission.");
    } else {
      setEnabled(data.value === 'true');
    }
    setSaving(false);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${settingKey} ${enabled ? 'on' : 'off'}`}
      disabled={saving || !loaded}
      onPointerDown={e => { e.preventDefault(); void toggle(); }}
      className={`relative h-6 w-11 shrink-0 rounded-full transform-gpu transition-transform active:scale-95 disabled:opacity-60 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform transform-gpu ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function SettingsTab({ active, showToast }: Props) {
  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Sliders className="w-5 h-5 text-slate-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-slate-900">Service Availability</h3>
            <p className="text-xs font-normal text-slate-400 mt-1">
              Hide a service's entry point on the customer Dashboard without touching drivers, riders, or existing orders — flip it back on any time.
            </p>
          </div>
        </div>

        {SERVICES.map(service => (
          <div key={service.key} className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <div className={`w-9 h-9 rounded-xl ${service.iconBg} flex items-center justify-center shrink-0`}>
              <service.icon className={`w-4 h-4 ${service.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700">{service.label}</p>
              <p className="text-xs font-normal text-slate-400">{service.description}</p>
            </div>
            <AppSettingToggle settingKey={service.key} showToast={showToast} />
          </div>
        ))}
      </div>
    </div>
  );
}
