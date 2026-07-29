import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { WaIcon } from '../lib/whatsapp';
import {
  Truck, Home, MapPin, Banknote, Shield,
  Package, ChevronRight, ChevronLeft, Phone, Bike,
  Check, CheckCircle2, Navigation, ClipboardList, RotateCcw,
} from 'lucide-react';

interface TransporterProvider {
  id: string;
  name: string;
  phone: string;
  gerak_id: string;
  campus: string;
  vehicle: string | null;
  plate_number: string | null;
}

const FEATURES = [
  { icon: Home,     label: 'Ambil Depan Rumah',            desc: 'Kami datang ke lokasi anda' },
  { icon: MapPin,   label: 'Hantar Terus Depan Rumah',     desc: 'Sampai ke pintu destinasi' },
  { icon: Banknote, label: 'Bayar Masa Gaji Boleh',        desc: 'Pembayaran fleksibel' },
  { icon: Truck,    label: 'Semua Jenis Moto',             desc: 'Bebek, sport, skuter & lain-lain' },
  { icon: Package,  label: 'Barang Pindah Berskala Kecil', desc: 'Pindahan ringan & kecil' },
  { icon: Shield,   label: 'Selamat Dijamin',              desc: 'Ikatan kukuh & selamat' },
];

const STEPS = [
  { n: '1', label: 'Hubungi & Booking',     desc: 'Whatsapp untuk semak ketersediaan & harga' },
  { n: '2', label: 'Moto / Barang Diambil', desc: 'Kami tiba di lokasi anda pada tarikh yang ditetapkan' },
  { n: '3', label: 'Selamat Sampai',        desc: 'Dihantar terus ke destinasi — pasti puas hati' },
];

// Booking form's multi-select services — keys match transporter_bookings'
// `services text[]` column and the RPC's server-side allowlist exactly
// (see migration_transporter_bookings.sql), so nothing here is free text.
const SERVICE_OPTIONS = [
  { key: 'motorcycle' as const,    label: 'Motorcycle',    desc: 'Semua jenis motor', icon: Bike },
  { key: 'pindah_barang' as const, label: 'Pindah Barang', desc: 'Perkhidmatan pindah barang', icon: Package },
];
type ServiceKey = typeof SERVICE_OPTIONS[number]['key'];

const formatPhone = (phone: string) => phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2$3');

// Quick-contact from the provider list card — a generic inquiry, not tied
// to a specific service (that's chosen inside the actual booking form now
// that this page lists multiple providers instead of one hardcoded one).
const buildQuickWaMsg = () =>
  encodeURIComponent(
`Assalamualaikum, saya berminat dengan perkhidmatan *Gerak Transporter* anda 🏍️

Boleh saya dapatkan maklumat harga & ketersediaan? Terima kasih 🙏`
  );

// Sent once a booking is actually recorded — pre-filled from the customer's
// own form input, since providers have no in-app dashboard to see this
// booking otherwise; price is always negotiated here, over WhatsApp, never
// computed or trusted from the client.
const buildBookingWaMsg = (services: ServiceKey[], pickup: string, destination: string, name: string) =>
  encodeURIComponent(
`Assalamualaikum, saya baru buat tempahan *Gerak Transporter* melalui app 🏍️

Perkhidmatan: ${services.map(s => SERVICE_OPTIONS.find(o => o.key === s)?.label ?? s).join(', ')}
Pickup: ${pickup}
Destinasi: ${destination}
Nama: ${name}

Boleh saya dapatkan maklumat harga & ketersediaan? Terima kasih 🙏`
  );

export const GerakTransporter: React.FC = () => {
  const { user, showAuthGate, setLeaveGuard } = useApp();

  const [providers,        setProviders]        = useState<TransporterProvider[]>([]);
  const [providersLoading, setProvidersLoading]  = useState(true);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    const { data } = await supabase.from('transporter_provider_public').select('*');
    setProviders((data as TransporterProvider[]) ?? []);
    setProvidersLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => loadProviders()); }, [loadProviders]);

  // ── Booking sub-page (Sub-page Standard) ──────────────────────────────────
  const [selectedProvider, setSelectedProvider] = useState<TransporterProvider | null>(null);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set());
  const [tripPickup,      setTripPickup]      = useState('');
  const [tripDestination, setTripDestination] = useState('');
  const [tripNotes,       setTripNotes]       = useState('');
  const [booking,         setBooking]         = useState(false);
  const [bookingError,    setBookingError]    = useState<string | null>(null);
  const [bookingDone,     setBookingDone]     = useState<{ ref: string } | null>(null);

  const toggleService = (key: ServiceKey) => {
    setSelectedServices(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const resetBookingForm = () => {
    setSelectedServices(new Set());
    setTripPickup('');
    setTripDestination('');
    setTripNotes('');
    setBookingError(null);
    setBookingDone(null);
  };

  // Registers with AppContext's shared goBack() (header back chevron,
  // hardware back, or the edge-swipe gesture all call it) so leaving the
  // booking form or success screen returns to the provider list first,
  // instead of skipping past it straight back to Dashboard — same pattern
  // as GerakRental.tsx's book/my-bookings <-> list chain.
  useEffect(() => {
    if (!selectedProvider) { setLeaveGuard(null); return; }
    setLeaveGuard(() => () => { setSelectedProvider(null); resetBookingForm(); });
    return () => setLeaveGuard(null);
  }, [selectedProvider, setLeaveGuard]);

  const canBook = selectedServices.size > 0 && !!tripPickup.trim() && !!tripDestination.trim() && !booking;

  const handleBook = async () => {
    if (!user.isLoggedIn) { showAuthGate(); return; }
    if (!canBook || !selectedProvider) return;
    setBooking(true);
    setBookingError(null);

    const services = Array.from(selectedServices);
    const { data, error } = await supabase.rpc('create_transporter_booking', {
      p_provider_id: selectedProvider.id,
      p_services: services,
      p_pickup: tripPickup.trim(),
      p_destination: tripDestination.trim(),
      p_notes: tripNotes.trim() || null,
    });

    setBooking(false);
    if (error || !data?.success) {
      setBookingError(data?.error ?? 'Booking failed. Please try again.');
      return;
    }

    setBookingDone({ ref: `#${String(data.id).slice(0, 8).toUpperCase()}` });
    // Notify the human provider directly — no in-app dashboard shows them
    // this booking otherwise.
    window.open(
      `https://wa.me/6${selectedProvider.phone}?text=${buildBookingWaMsg(services, tripPickup.trim(), tripDestination.trim(), user.name || 'Student')}`,
      '_blank',
    );
  };

  // ── Booking sub-page — success screen ─────────────────────────────────────
  if (selectedProvider && bookingDone) {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 px-5 animate-fade-in flex flex-col gap-5">
        <div className="mt-6 bg-white border border-slate-100 rounded-3xl p-6 flex flex-col gap-4"
          style={{ marginBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 m-0">Booking Submitted!</h2>
              <p className="text-xs text-emerald-500 font-normal mt-0.5">{bookingDone.ref} · Price TBC</p>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-2">Order Summary</p>
            <p><span className="text-slate-400">Provider:</span> {selectedProvider.name}</p>
            <p><span className="text-slate-400">Services:</span> {Array.from(selectedServices).map(s => SERVICE_OPTIONS.find(o => o.key === s)?.label ?? s).join(', ')}</p>
            <p><span className="text-slate-400">Pickup:</span> {tripPickup}</p>
            <p><span className="text-slate-400">Destination:</span> {tripDestination}</p>
            {tripNotes && <p><span className="text-slate-400">Remark:</span> {tripNotes}</p>}
            <p><span className="text-slate-400">Price:</span> TBC — negotiated with {selectedProvider.name}</p>
          </div>

          <p className="text-xs text-slate-400 font-normal text-center leading-relaxed">
            WhatsApp opened with your details pre-filled — confirm price &amp; availability directly with {selectedProvider.name}.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => { resetBookingForm(); }}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-2xl shadow-md shadow-primary/20 transition active:scale-[0.99]"
            >
              <RotateCcw className="w-4 h-4" />
              New Booking
            </button>
          </div>

          <button
            onClick={() => { setSelectedProvider(null); resetBookingForm(); }}
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-primary text-xs font-normal py-1 transition"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Back to Gerak Transporter
          </button>
        </div>
      </div>
    );
  }

  // ── Booking sub-page — form ────────────────────────────────────────────────
  if (selectedProvider) {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">
        <div className="px-4 flex flex-col gap-4">

          {/* Sub-page header — own back chevron, page's global Header back
              button navigates between top-level pages, not this in-page view */}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => { setSelectedProvider(null); resetBookingForm(); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-slate-800 m-0">Book Gerak Transporter</h2>
              <p className="text-xs text-slate-400 font-normal mt-0.5">{selectedProvider.name}</p>
            </div>
          </div>

          {/* Our Services — multi-select */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-slate-700">Our Services</h3>
            <div className="flex flex-col gap-2">
              {SERVICE_OPTIONS.map(opt => {
                const active = selectedServices.has(opt.key);
                const Icon = opt.icon;
                return (
                  <button key={opt.key} type="button"
                    onPointerDown={e => { e.preventDefault(); toggleService(opt.key); }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 ${
                      active ? 'border-slate-900' : 'border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-100">
                        <Icon className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-500'}`} />
                      </div>
                      <div className="text-left">
                        <p className={`text-xs font-semibold ${active ? 'text-slate-900' : 'text-slate-700'}`}>{opt.label}</p>
                        <p className="text-xs text-slate-400 font-normal mt-0.5">{opt.desc}</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      active ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
                    }`}>
                      {active && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trip */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> Trip
            </h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-normal text-slate-400 pl-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> From
              </label>
              <input
                type="text"
                value={tripPickup}
                onChange={e => setTripPickup(e.target.value)}
                placeholder="e.g. Kolej Kediaman 3"
                style={{ fontSize: '16px' }}
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-normal text-slate-400 pl-1 flex items-center gap-1">
                <Navigation className="w-3 h-3" /> To
              </label>
              <input
                type="text"
                value={tripDestination}
                onChange={e => setTripDestination(e.target.value)}
                placeholder="e.g. Kuantan Sentral"
                style={{ fontSize: '16px' }}
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>
            <textarea
              value={tripNotes}
              onChange={e => setTripNotes(e.target.value)}
              rows={2}
              placeholder="Any notes for the provider? (optional)"
              style={{ fontSize: '16px' }}
              className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-700 focus:outline-none focus:border-slate-900 transition resize-none placeholder:font-normal placeholder:text-slate-300"
            />
          </div>

          {/* Provider contact — WhatsApp next to phone number */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-normal text-slate-400">Booking with</p>
              <p className="text-xs font-semibold text-slate-700">{selectedProvider.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">{formatPhone(selectedProvider.phone)}</span>
              <a href={`https://wa.me/6${selectedProvider.phone}`} target="_blank" rel="noopener noreferrer"
                className="text-[#25D366] active:scale-90 transition shrink-0">
                <WaIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Price — TBC, negotiated over WhatsApp (Book Now Standard) */}
          <div className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-normal block">Price</span>
              <span className="text-base font-black text-slate-800">TBC</span>
            </div>
            <span className="text-xs text-slate-400 font-normal text-right max-w-[55%]">
              Negotiated directly with the provider
            </span>
          </div>

          {bookingError && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-xs text-danger font-semibold text-center">
              {bookingError}
            </div>
          )}

          <button
            type="button"
            onClick={handleBook}
            disabled={!canBook}
            className={`w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-2xl transition-all duration-300 active:scale-[0.99] ${
              canBook
                ? 'bg-primary hover:bg-primary-hover shadow-lg shadow-primary/30 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
            style={{ marginBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}
          >
            {booking ? (
              <span className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
            ) : (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Book</>
            )}
          </button>
          {!canBook && !booking && (
            <p className="text-xs text-slate-400 font-normal text-center -mt-3" style={{ marginBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
              {selectedServices.size === 0 ? 'Select at least one service to continue' :
               !tripPickup.trim() || !tripDestination.trim() ? 'Fill in From and To to continue' : ''}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Provider list / marketing page ────────────────────────────────────────
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">
      <div className="px-4 flex flex-col gap-4">

        {/* Page header */}
        <div className="mt-4">
          <h2 className="text-xl font-semibold text-slate-800 m-0 flex items-center gap-2">
            <Truck className="w-5 h-5 text-slate-400" /> Gerak Transporter
          </h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Penghantaran Motosikal & Pindah Barang</p>
        </div>

        {/* Available Providers — Solo Card Standard */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 px-1">
            <Truck className="w-3.5 h-3.5 text-slate-400" /> Available Providers
          </h3>

          {providersLoading ? (
            <div className="flex justify-center py-8">
              <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            </div>
          ) : providers.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col items-center gap-2 text-center">
              <Truck className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">No providers available right now</p>
              <p className="text-xs text-slate-400 font-normal">Check back soon — new service providers are onboarded by admin.</p>
            </div>
          ) : (
            providers.map(p => (
              <div key={p.id} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
                <div
                  onClick={() => setSelectedProvider(p)}
                  className="flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-slate-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 font-normal mt-0.5">{p.gerak_id} · UMPSA {p.campus}</p>
                  </div>
                  <span className="shrink-0 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-semibold px-2.5 py-1 rounded-xl">
                    Aktif
                  </span>
                </div>

                {(p.vehicle || p.plate_number) && (
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                    {p.vehicle && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-normal text-slate-400">Kenderaan</span>
                        <span className="text-xs font-semibold text-slate-700">{p.vehicle}</span>
                      </div>
                    )}
                    {p.plate_number && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-normal text-slate-400">Plat</span>
                        <span className="text-xs font-semibold text-slate-700">{p.plate_number}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1 border-t border-slate-100">
                  <a
                    href={`https://wa.me/6${p.phone}?text=${buildQuickWaMsg()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="w-11 h-11 flex items-center justify-center bg-white border border-slate-100 rounded-2xl active:scale-95 transition shrink-0"
                  >
                    <WaIcon className="w-4 h-4 text-[#25D366]" />
                  </a>
                  <a
                    href={`tel:+6${p.phone}`}
                    onClick={e => e.stopPropagation()}
                    className="w-11 h-11 flex items-center justify-center bg-white border border-slate-100 text-slate-700 rounded-2xl active:scale-95 transition shrink-0"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider(p)}
                    className="flex-1 flex items-center justify-between bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold px-4 rounded-2xl text-xs transition"
                  >
                    Book
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Perkhidmatan Kami — always visible, no accordion */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Perkhidmatan Kami</h3>
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3 p-3 border border-slate-100 rounded-2xl">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
                <p className="text-xs font-normal text-slate-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Cara Tempahan */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Cara Tempahan</h3>
          <div className="flex flex-col gap-4">
            {STEPS.map(({ n, label, desc }, i) => (
              <div key={n} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center">
                    {n}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-0.5 flex-1 bg-slate-100 mt-1.5" style={{ minHeight: 20 }} />
                  )}
                </div>
                <div className="pb-3">
                  <p className="text-xs font-semibold text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400 font-normal mt-0.5 leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Price note */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex items-start gap-3"
          style={{ marginBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
            <Banknote className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-800">Harga Berdasarkan Jarak</p>
            <p className="text-xs text-slate-400 font-normal mt-1 leading-relaxed">
              Harga bergantung kepada jarak perjalanan dan jenis perkhidmatan.
              Hubungi penyedia untuk sebut harga percuma.
            </p>
            <p className="text-xs text-slate-500 font-normal mt-2">Tempahan awal disyorkan.</p>
          </div>
        </div>

      </div>
    </div>
  );
};
