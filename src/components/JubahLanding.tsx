import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';

type RiderDir = { id: string; name: string; jubah_drop_point: string | null; ic_number: string | null; phone: string | null };

const maskIc = (ic: string | null) => {
  if (!ic) return '—';
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return ic;
  return `${digits.slice(0, 6)}-XX-XXXX`;
};

const IcMasked: React.FC<{ ic: string | null }> = ({ ic }) => {
  if (!ic) return <span className="text-slate-800 font-bold text-sm">—</span>;
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return <span className="text-slate-800 font-bold text-sm">{ic}</span>;
  return (
    <span className="font-bold text-sm font-mono">
      <span className="text-slate-800">{digits.slice(0, 6)}</span>
      <span className="text-slate-800">-</span>
      <span className="text-red-500">XX</span>
      <span className="text-slate-800">-</span>
      <span className="text-red-500">XXXX</span>
    </span>
  );
};

const UNIVERSITIES = [
  { key: 'umpsa', label: 'Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)' },
  { key: 'uitm',  label: 'Universiti Teknologi MARA (UiTM)' },
  { key: 'umk',   label: 'Universiti Malaysia Kelantan (UMK)' },
  { key: 'ukm',   label: 'Universiti Kebangsaan Malaysia (UKM)' },
  { key: 'uiam',  label: 'Universiti Islam Antarabangsa Malaysia (UIA)' },
];

const BUCKET = 'jubah-banners';

interface Props {
  onProceed: (universityKey: string) => void;
}

export const JubahLanding: React.FC<Props> = ({ onProceed }) => {
  const { setSheetOpen } = useApp();

  const [selectedKey, setSelectedKey]   = useState('');
  const [bannerUrls, setBannerUrls]     = useState<Record<string, string>>({});
  const [imgError, setImgError]         = useState<Record<string, boolean>>({});
  const [riderDir, setRiderDir]         = useState<RiderDir[]>([]);
  const [selectedRider, setSelectedRider] = useState<RiderDir | null>(null);
  const [btnCollapsed, setBtnCollapsed] = useState(false);
  const collapseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openRider  = (r: RiderDir) => { setSelectedRider(r); setSheetOpen(true); };
  const closeRider = ()            => { setSelectedRider(null); setSheetOpen(false); };

  // Campus mapping for the directory RPC
  const CAMPUS_MAP: Record<string, string> = {
    umpsa: '', // both Pekan and Gambang — or pass '' to get all
    uitm: '', umk: '', ukm: '', uiam: '',
  };

  // Load public URLs for all universities + default on mount
  useEffect(() => {
    const urls: Record<string, string> = {};
    const bust = Date.now();
    ['default', ...UNIVERSITIES.map(u => u.key)].forEach(key => {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${key}.jpg`);
      urls[key] = `${data.publicUrl}?t=${bust}`;
    });
    setBannerUrls(urls);
  }, []);

  useEffect(() => () => { if (collapseRef.current) clearTimeout(collapseRef.current); }, []);

  const handleUniversityChange = (key: string) => {
    setSelectedKey(key);
    setBtnCollapsed(false);
    setImgError(prev => ({ ...prev, [key]: false }));
    if (collapseRef.current) clearTimeout(collapseRef.current);
    if (key) collapseRef.current = setTimeout(() => setBtnCollapsed(true), 1500);
    if (key !== 'umpsa') { setRiderDir([]); return; }
    const campus = CAMPUS_MAP[key] ?? '';
    supabase.rpc('get_jubah_riders_directory', { p_campus: campus })
      .then(({ data }) => setRiderDir((data as RiderDir[]) ?? []));
  };

  const showDefault    = !selectedKey || imgError[selectedKey];
  const displayKey     = showDefault ? 'default' : selectedKey;
  const currentBanner  = bannerUrls[displayKey];
  const hasBannerError = imgError[displayKey];
  const selectedLabel  = UNIVERSITIES.find(u => u.key === selectedKey)?.label ?? '';

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto overflow-x-hidden no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4">

      {/* Header */}
      <div className="mt-4 px-1">
        <h2 className="text-xl font-black m-0 text-slate-800">Jubah Delivery</h2>
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">
          Select your university to continue
        </p>
      </div>

      {/* University selector + banner */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Select University</h3>
          {selectedKey && (
            <button
              type="button"
              onClick={() => onProceed(selectedKey)}
              className="flex items-center justify-center gap-0.5 bg-blue-600 text-white rounded-xl h-9 active:scale-95 shadow-sm overflow-hidden shrink-0"
              style={{
                maxWidth: btnCollapsed ? '36px' : '92px',
                paddingLeft:  btnCollapsed ? '8px' : '12px',
                paddingRight: btnCollapsed ? '8px' : '10px',
                transition: 'max-width 0.45s cubic-bezier(0.4,0,0.2,1), padding 0.45s ease',
              }}
            >
              <span
                className="text-xs font-extrabold whitespace-nowrap overflow-hidden"
                style={{
                  maxWidth: btnCollapsed ? '0px' : '52px',
                  opacity:  btnCollapsed ? 0 : 1,
                  transition: 'max-width 0.4s ease, opacity 0.25s ease',
                }}
              >
                Next
              </span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>

        <select
          value={selectedKey}
          onChange={e => handleUniversityChange(e.target.value)}
          style={{ fontSize: '12px' }}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-bold text-slate-700 focus:outline-none focus:border-blue-500"
        >
          <option value="" disabled>Choose your university…</option>
          {UNIVERSITIES.map(u => (
            <option key={u.key} value={u.key}>{u.label}</option>
          ))}
        </select>

        {/* Banner area */}
        <div className="w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 h-40 flex items-center justify-center relative">
          {currentBanner && !hasBannerError ? (
            <img
              src={currentBanner}
              alt={`${selectedLabel || 'Gerak'} banner`}
              className="w-full h-full object-cover"
              onError={() => setImgError(prev => ({ ...prev, [displayKey]: true }))}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-300 p-4 text-center">
              <ImageIcon className="w-10 h-10" />
              <span className="text-[10px] font-bold">No banner uploaded yet</span>
            </div>
          )}
        </div>

      </div>

      {/* Rider Directory Table */}
      {riderDir.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Our Representatives</h3>
          <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[280px]">
            <table className="min-w-full border-collapse text-left" style={{ minWidth: 480 }}>
              <thead className="sticky top-0 bg-white">
                <tr className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-2 pr-4 whitespace-nowrap">Method</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Representative Name</th>
                  <th className="py-2 pr-4 whitespace-nowrap">I/C Number</th>
                  <th className="py-2 whitespace-nowrap">H/P</th>
                </tr>
              </thead>
              <tbody>
                {riderDir.map(r => (
                  <tr key={r.id} onClick={() => openRider(r)}
                    className="border-b border-slate-50 text-[10px] cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition">
                    <td className="py-2.5 pr-4 text-slate-600 font-semibold align-top whitespace-nowrap">
                      {r.jubah_drop_point || '—'}
                    </td>
                    <td className="py-2.5 pr-4 font-extrabold text-slate-800 align-top">
                      {r.name}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-slate-500 align-top whitespace-nowrap">
                      <span className="text-slate-800 font-semibold">{maskIc(r.ic_number)}</span>
                    </td>
                    <td className="py-2.5 font-semibold text-slate-700 align-top whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{r.phone || '—'}</span>
                        {r.phone && <WaIcon className="w-3.5 h-3.5 text-[#25D366]" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-slate-400 font-semibold">
            💡 I/C numbers are partially masked. Tap the WhatsApp icon to contact the representative and confirm the full IC for physical registration.
          </p>
        </div>
      )}


      {/* Representative profile sheet */}
      {selectedRider && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={closeRider} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto no-scrollbar">

            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Representative</p>
                <h3 className="text-base font-black text-slate-800 mt-0.5">{selectedRider.name}</h3>
              </div>
              <button onClick={closeRider}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="px-5 py-4 flex flex-col gap-5">

              {/* Method */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Method</span>
                <span className="text-sm font-bold text-slate-800">{selectedRider.jubah_drop_point || '—'}</span>
              </div>

              {/* Representative Name */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Representative Name</span>
                <span className="text-sm font-bold text-slate-800">{selectedRider.name}</span>
              </div>

              {/* IC Number */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">I/C Number</span>
                <IcMasked ic={selectedRider.ic_number} />
              </div>

              {/* H/P Number */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">H/P Number</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{selectedRider.phone || '—'}</span>
                  {selectedRider.phone && (
                    <a
                      href={`https://wa.me/${toWa(selectedRider.phone)}?text=${encodeURIComponent(
                        `Hello gerak rider, i need your IC number : ${maskIc(selectedRider.ic_number)} for my booking. boleh bagi sekarang?`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[#25D366] active:scale-90 transition shrink-0"
                    >
                      <WaIcon className="w-5 h-5" />
                    </a>
                  )}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

    </div>
  );
};
