import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WaIcon } from '../lib/whatsapp';
import {
  Truck, Home, MapPin, Banknote, Shield,
  Package, Clock, ChevronRight, Phone, Bike,
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
  const { user, showAuthGate } = useApp();
  const [serviceType, setServiceType] = useState<'Penghantaran Motosikal' | 'Pindah Barang'>('Penghantaran Motosikal');

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">
      <div className="px-4 flex flex-col gap-4">

        {/* Page header */}
        <div className="mt-4">
          <h2 className="text-xl font-bold text-slate-800 m-0">Gerak Transporter</h2>
          <p className="text-xs text-slate-400 font-normal mt-1">Penghantaran Motosikal & Pindah Barang</p>
        </div>

        {/* Mode Selector Standard */}
        <div className="flex gap-2">
          {(['Penghantaran Motosikal', 'Pindah Barang'] as const).map(s => {
            const active = serviceType === s;
            return (
              <button
                key={s}
                type="button"
                onPointerDown={(e) => { e.preventDefault(); setServiceType(s); }}
                className={`flex-1 flex items-center gap-2.5 p-3 rounded-2xl border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 ${
                  active ? 'border-slate-900' : 'border-slate-100'
                }`}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-100">
                  {s === 'Penghantaran Motosikal'
                    ? <Bike    className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-500'}`} />
                    : <Package className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-500'}`} />}
                </div>
                <span className={`text-xs font-semibold ${active ? 'text-slate-900' : 'text-slate-600'}`}>
                  {s === 'Penghantaran Motosikal' ? 'Motosikal' : 'Pindah Barang'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Provider Card */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Penyedia Perkhidmatan</h3>

          {/* Provider identity */}
          <div className="border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-slate-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-tight">{PROVIDER.name}</p>
              <p className="text-xs text-slate-400 font-normal mt-0.5">{PROVIDER.tagline}</p>
            </div>
            <span className="shrink-0 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-semibold px-2.5 py-1 rounded-xl">
              Aktif
            </span>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Kenderaan', value: PROVIDER.vehicle },
              { label: 'Plat',      value: PROVIDER.plate },
              { label: 'Kawasan',   value: PROVIDER.campus },
              { label: 'Hubungi',   value: PROVIDER.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2$3') },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-xs font-normal text-slate-400">{label}</span>
                <span className="text-xs font-semibold text-slate-700">{value}</span>
              </div>
            ))}
          </div>

          {/* Feature tags */}
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
            {['Selamat Dijamin', 'Pantas & Tepat Masa', 'Servis Mesra', 'Ikatan Selamat'].map(g => (
              <span key={g} className="text-xs font-normal bg-white border border-slate-100 text-slate-500 px-2.5 py-1 rounded-xl">
                ✓ {g}
              </span>
            ))}
          </div>

          {/* Contact buttons */}
          <div className="flex gap-2 pt-1 border-t border-slate-100">
            <a
              href={`https://wa.me/6${PROVIDER.phone}?text=${buildWaMsg(serviceType)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 rounded-2xl active:scale-95 transition shrink-0"
            >
              <WaIcon className="w-5 h-5 text-[#25D366]" />
            </a>
            <a
              href={`tel:+6${PROVIDER.phone}`}
              className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-700 rounded-2xl active:scale-95 transition shrink-0"
            >
              <Phone className="w-4 h-4" />
            </a>
          </div>
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
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex items-start gap-3">
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

        {/* Book CTA */}
        <a
          href={user.isLoggedIn ? `https://wa.me/6${PROVIDER.phone}?text=${buildWaMsg(serviceType)}` : '#'}
          target={user.isLoggedIn ? '_blank' : '_self'}
          rel="noopener noreferrer"
          onClick={e => { if (!user.isLoggedIn) { e.preventDefault(); showAuthGate(); } }}
          className="w-full flex items-center justify-between bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold py-4 px-5 rounded-2xl text-sm transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold leading-tight">Tempah Sekarang</p>
              <p className="text-xs text-white/70 font-normal mt-0.5">{serviceType}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" />
        </a>

      </div>
    </div>
  );
};
