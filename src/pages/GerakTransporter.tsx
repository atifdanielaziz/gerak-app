import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WaIcon } from '../lib/whatsapp';
import {
  Truck, Home, MapPin, Banknote, Shield,
  Package, Clock, ChevronRight, Phone,
} from 'lucide-react';

const PROVIDER = {
  name:     'Khai Transporter',
  phone:    '0133978113',
  plate:    'DEK 4212',
  vehicle:  'Isuzu D-Max 4×4 Pickup',
  tagline:  'Selamat • Pantas • Boleh Dipercayai',
  campus:   'Pekan & Gambang',
};

const FEATURES = [
  { icon: Home,     label: 'Ambil Depan Rumah',          desc: 'Kami datang ke lokasi anda' },
  { icon: MapPin,   label: 'Hantar Terus Depan Rumah',   desc: 'Sampai ke pintu destinasi' },
  { icon: Banknote, label: 'Bayar Masa Gaji Boleh',      desc: 'Pembayaran fleksibel' },
  { icon: Truck,    label: 'Semua Jenis Moto',           desc: 'Bebek, sport, skuter & lain-lain' },
  { icon: Package,  label: 'Barang Pindah Berskala Kecil', desc: 'Pindahan ringan & kecil' },
  { icon: Shield,   label: 'Selamat Dijamin',            desc: 'Ikatan kukuh & selamat' },
];

const STEPS = [
  { n: '1', label: 'Hubungi & Booking', desc: 'Whatsapp untuk semak ketersediaan & harga' },
  { n: '2', label: 'Moto / Barang Diambil', desc: 'Kami tiba di lokasi anda pada tarikh yang ditetapkan' },
  { n: '3', label: 'Selamat Sampai', desc: 'Dihantar terus ke destinasi — pasti puas hati' },
];

const buildWaMsg = (service: string) =>
  encodeURIComponent(
`Assalamualaikum, saya berminat dengan perkhidmatan *Gerak Transporter* 🏍️

Perkhidmatan: ${service}
Pickup:
Destinasi:
Tarikh:
Moto / Barang:
Nama:

Boleh saya dapatkan maklumat harga & ketersediaan? Terima kasih 🙏`
  );

export const GerakTransporter: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [serviceType, setServiceType] = useState<'Penghantaran Motosikal' | 'Pindah Barang'>('Penghantaran Motosikal');

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 flex flex-col gap-4 animate-fade-in">

      {/* ── HERO ── */}
      <div className="bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400 px-5 pt-6 pb-8 relative overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-16 bottom-0 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white m-0 leading-tight">Gerak Transporter</h2>
              <p className="text-[10px] text-white/80 font-extrabold uppercase tracking-widest mt-0.5">
                Penghantaran Motosikal & Pindah Barang
              </p>
            </div>
          </div>

          <p className="text-xs text-white/90 font-semibold leading-relaxed max-w-xs">
            Selamat • Pantas • Boleh Dipercayai —
            kami uruskan pengangkutan moto anda dari pintu ke pintu.
          </p>

          {/* Service toggle */}
          <div className="flex bg-black/20 border border-white/20 rounded-2xl p-1 gap-1 mt-1">
            {(['Penghantaran Motosikal', 'Pindah Barang'] as const).map(s => (
              <button key={s} onClick={() => setServiceType(s)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-extrabold transition active:scale-95 ${
                  serviceType === s ? 'bg-white text-orange-600 shadow-sm' : 'text-white/70'
                }`}>
                {s === 'Penghantaran Motosikal' ? '🏍️ Motosikal' : '📦 Pindah Barang'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 flex flex-col gap-4">

        {/* ── FEATURES GRID ── */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Perkhidmatan Kami</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-orange-50 border border-orange-100 rounded-2xl p-3 flex flex-col gap-1.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-[10px] font-extrabold text-slate-800 leading-tight">{label}</p>
                <p className="text-[9px] font-semibold text-slate-400 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── PROVIDER CARD ── */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Penyedia Perkhidmatan</h3>

          <div className="border border-orange-100 rounded-2xl overflow-hidden">
            {/* Provider header */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-400 px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white leading-tight">{PROVIDER.name}</p>
                <p className="text-[9px] text-white/80 font-extrabold uppercase tracking-wider mt-0.5">{PROVIDER.tagline}</p>
              </div>
              <span className="shrink-0 bg-emerald-400/30 border border-emerald-300/40 text-white text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Aktif
              </span>
            </div>

            {/* Provider details */}
            <div className="p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Kenderaan',  value: PROVIDER.vehicle },
                  { label: 'Plat',       value: PROVIDER.plate },
                  { label: 'Kawasan',    value: PROVIDER.campus },
                  { label: 'Hubungi',    value: PROVIDER.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2$3') },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">{label}</span>
                    <span className="text-[11px] font-bold text-slate-700">{value}</span>
                  </div>
                ))}
              </div>

              {/* Guarantees */}
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-50">
                {['Selamat Dijamin', 'Pantas & Tepat Masa', 'Servis Mesra', 'Ikatan Selamat'].map(g => (
                  <span key={g} className="text-[8px] font-extrabold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    ✓ {g}
                  </span>
                ))}
              </div>

              {/* CTA buttons */}
              <div className="flex gap-2 pt-1">
                <a
                  href={`https://wa.me/6${PROVIDER.phone}?text=${buildWaMsg(serviceType)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20b858] active:scale-[0.98] text-white font-extrabold py-3 rounded-2xl text-xs transition shadow-md shadow-green-500/20"
                >
                  <WaIcon className="w-4 h-4" /> WhatsApp
                </a>
                <a
                  href={`tel:+6${PROVIDER.phone}`}
                  className="w-12 h-12 flex items-center justify-center bg-orange-50 border border-orange-200 text-orange-600 rounded-2xl active:scale-95 transition shrink-0"
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cara Tempahan</h3>

          <div className="flex flex-col gap-3">
            {STEPS.map(({ n, label, desc }, i) => (
              <div key={n} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-8 h-8 rounded-full bg-orange-500 text-white text-xs font-extrabold flex items-center justify-center">
                    {n}
                  </div>
                  {i < STEPS.length - 1 && <div className="w-0.5 flex-1 bg-orange-100 mt-1.5" style={{ minHeight: 20 }} />}
                </div>
                <div className="pb-3">
                  <p className="text-xs font-extrabold text-slate-800">{label}</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PRICE NOTE ── */}
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 shadow-sm flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
            <Banknote className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-800">Harga Berdasarkan Jarak</p>
            <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-relaxed">
              Harga bergantung kepada jarak perjalanan dan jenis perkhidmatan.
              Hubungi penyedia untuk sebut harga percuma.
            </p>
            <p className="text-[9px] text-amber-600 font-extrabold mt-2 uppercase tracking-wider">
              ⚡ Tempahan awal disyorkan
            </p>
          </div>
        </div>

        {/* ── MAIN BOOK BUTTON ── */}
        <a
          href={`https://wa.me/6${PROVIDER.phone}?text=${buildWaMsg(serviceType)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-extrabold py-4 px-5 rounded-3xl text-sm transition shadow-lg shadow-orange-500/30"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black leading-tight">Tempah Sekarang</p>
              <p className="text-[10px] text-white/80 font-semibold mt-0.5">{serviceType}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" />
        </a>

        {/* ── BACK LINK ── */}
        <button
          onClick={() => setCurrentPage('dashboard')}
          className="text-xs text-slate-400 font-semibold hover:text-primary active:scale-95 transition text-center mt-1"
        >
          ← Kembali ke Dashboard
        </button>

      </div>
    </div>
  );
};
