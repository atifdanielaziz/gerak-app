import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { ChevronRight, Image as ImageIcon, Users, PackageSearch, GraduationCap } from 'lucide-react';
import { WaIcon } from '../lib/whatsapp';
import { RepresentativeSheet } from './RepresentativeSheet';
import { Dropdown } from './Dropdown';

type RiderDir = { id: string; name: string; drop_point: string | null; method: string | null; ic_number: string | null; phone: string | null };

const IcMasked: React.FC<{ ic: string | null }> = ({ ic }) => {
  if (!ic) return <span className="font-semibold text-slate-700">—</span>;
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return <span className="font-semibold text-slate-700 font-mono">{ic}</span>;
  return (
    <span className="font-semibold font-mono">
      <span className="text-slate-700">{digits.slice(0, 6)}</span>
      <span className="text-slate-700">-</span>
      <span className="text-red-500">XX</span>
      <span className="text-slate-700">-</span>
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
  const { setSheetOpen, user, setCurrentPage } = useApp();
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';

  const [selectedKey, setSelectedKey]   = useState('');
  const [bannerUrls, setBannerUrls]     = useState<Record<string, string>>({});
  const [imgError, setImgError]         = useState<Record<string, boolean>>({});
  const [riderDir, setRiderDir]         = useState<RiderDir[]>([]);
  const [selectedRider, setSelectedRider] = useState<RiderDir | null>(null);

  const openRider  = (r: RiderDir) => { setSelectedRider(r); setSheetOpen(true); };
  const closeRider = ()            => { setSelectedRider(null); setSheetOpen(false); };

  // Campus list per university key — matches what admin uses in jubah_rider_assignments
  const CAMPUS_LIST: Record<string, string[]> = {
    umpsa: ['Pekan', 'Gambang'],
    uitm:  ['UiTM'],
    umk:   ['UMK'],
    ukm:   ['UKM'],
    uiam:  ['UIAM'],
  };

  const UNIV_SHORT: Record<string, string> = {
    umpsa: 'UMPSA', uitm: 'UiTM', umk: 'UMK', ukm: 'UKM', uiam: 'UIAM',
  };

  // Compute public URLs once on mount — daily bust so browser caches within the day
  // but everyone auto-fetches fresh after midnight if admin updates a banner
  useEffect(() => {
    const urls: Record<string, string> = {};
    const bust = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    ['default', ...UNIVERSITIES.map(u => u.key)].forEach(key => {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${key}.jpg`);
      urls[key] = `${data.publicUrl}?v=${bust}`;
    });
    queueMicrotask(() => {
      setBannerUrls(urls);
    });
  }, []);

  const handleUniversityChange = (key: string) => {
    setSelectedKey(key);
    setImgError(prev => ({ ...prev, [key]: false }));
    if (!key) { setRiderDir([]); return; }
    const campusList = CAMPUS_LIST[key] ?? [key];

    // SECURITY DEFINER RPC — works for anon/guest (direct profiles query is blocked by RLS)
    supabase.rpc('get_jubah_riders_directory_v2', { p_campuses: campusList })
      .then(({ data }) => {
        setRiderDir((data ?? []).map((r: { id: string; name: string; drop_point: string | null; method: string | null; ic_number: string | null; phone: string | null }) => ({
          id: r.id, name: r.name, drop_point: r.drop_point, method: r.method, ic_number: r.ic_number, phone: r.phone,
        })));
      });
  };

  const showDefault    = !selectedKey || imgError[selectedKey];
  const displayKey     = showDefault ? 'default' : selectedKey;
  const currentBanner  = bannerUrls[displayKey];
  const hasBannerError = imgError[displayKey];
  const selectedLabel  = UNIVERSITIES.find(u => u.key === selectedKey)?.label ?? '';

  return (
    <div className="flex-grow bg-white overflow-y-auto overflow-x-hidden no-scrollbar pb-4 px-4 animate-fade-in flex flex-col gap-4">

      {/* Header */}
      <div className="mt-4 px-1">
        <h2 className="text-xl font-semibold m-0 text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-slate-400" /> Jubah Delivery
        </h2>
        <p className="text-xs text-slate-400 font-normal mt-0.5">
          Select your university to continue
        </p>
      </div>

      {/* University selector + banner */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Select University</h3>
          <button
            type="button"
            onClick={() => { if (selectedKey) onProceed(selectedKey); }}
            disabled={!selectedKey}
            className={`flex items-center rounded-full py-1.5 transition-all duration-300 ease-out active:scale-90 ${
              selectedKey ? 'bg-primary text-white pl-3 pr-2' : 'bg-slate-100 text-slate-300 px-2'
            }`}
          >
            <span
              className="text-xs font-semibold whitespace-nowrap overflow-hidden"
              style={{
                maxWidth:   selectedKey ? '40px' : '0px',
                opacity:    selectedKey ? 1 : 0,
                marginRight: selectedKey ? '4px' : '0px',
                transition: 'max-width 0.35s ease, opacity 0.25s ease, margin-right 0.35s ease',
              }}
            >
              Next
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        <Dropdown
          value={selectedKey}
          onChange={handleUniversityChange}
          options={UNIVERSITIES.map(u => ({ value: u.key, label: u.label }))}
          placeholder="Choose your university…"
          label="Select University"
        />

        {/* Banner area — dynamic height (Option A) */}
        <div className="w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 relative">
          {currentBanner && !hasBannerError ? (
            <img
              src={currentBanner}
              alt={`${selectedLabel || 'Gerak'} banner`}
              className="w-full h-auto block"
              onError={() => setImgError(prev => ({ ...prev, [displayKey]: true }))}
            />
          ) : (
            <div className="min-h-[120px] flex flex-col items-center justify-center gap-2 text-slate-300 p-4 text-center">
              <ImageIcon className="w-10 h-10" />
              <span className="text-xs font-bold">No banner uploaded yet</span>
            </div>
          )}
          {/* Admin hint: shows when a university is selected but has no banner → falling back to default */}
          {isAdmin && selectedKey && imgError[selectedKey] && (
            <div className="absolute bottom-2 left-2 right-2 flex justify-center">
              <span className="bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded-full tracking-wide">
                Default banner · Upload {UNIV_SHORT[selectedKey] ?? selectedKey.toUpperCase()} banner via admin
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Track existing order — Solo Card Standard tappable row */}
      <button
        type="button"
        onClick={() => setCurrentPage('track-jubah')}
        className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3 active:bg-slate-50 transition active:scale-[0.98]"
      >
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
          <PackageSearch className="w-4 h-4 text-slate-600" />
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-700 text-left">Track My Jubah Order</span>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>

      {/* Rider Directory Table */}
      {riderDir.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Representative Directory
          </h3>
          <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[280px]">
            <table className="text-left border-collapse" style={{ minWidth: 480 }}>
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs font-semibold text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-4 whitespace-nowrap">Method</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Representative Name</th>
                  <th className="py-2 pr-4 whitespace-nowrap">I/C Number</th>
                  <th className="py-2 whitespace-nowrap">H/P</th>
                </tr>
              </thead>
              <tbody>
                {riderDir.map(r => (
                  <tr key={r.id} onClick={() => openRider(r)}
                    className="border-b border-slate-50 text-xs cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition">
                    <td className="py-2.5 pr-4 text-slate-600 font-semibold align-top whitespace-nowrap">
                      {r.method === 'pickup' ? 'Self Pickup' : r.method === 'postage' ? 'Pickup & Postage' : '—'}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-slate-800 align-top">
                      {r.name}
                    </td>
                    <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                      <IcMasked ic={r.ic_number} />
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
          <p className="text-xs text-slate-400 font-normal">
            I/C numbers are partially masked. Tap a row to contact the representative and confirm the full IC for physical registration.
          </p>
        </div>
      )}


      {/* Representative profile sheet */}
      {selectedRider && (
        <RepresentativeSheet
          name={selectedRider.name}
          dropPoint={selectedRider.drop_point || '—'}
          method={selectedRider.method === 'pickup' ? 'Self Pickup' : selectedRider.method === 'postage' ? 'Pickup & Postage' : '—'}
          icNumber={selectedRider.ic_number}
          phone={selectedRider.phone}
          waMessage={`Asslammualaikum Jubah rider, saya perlukan 6 digit IC ${selectedRider.ic_number ? selectedRider.ic_number.replace(/\D/g,'').slice(0,6) + '-XX-XXXX' : 'XXXXXX-XX-XXXX'} terakhir awak untuk pengisian representative jubah ${UNIV_SHORT[selectedKey] ?? selectedKey.toUpperCase()}`}
          onClose={closeRider}
        />
      )}

    </div>
  );
};
