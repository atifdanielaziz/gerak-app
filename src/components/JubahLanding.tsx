import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { ChevronRight, Upload, Image as ImageIcon } from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';

type RiderDir = { id: string; name: string; jubah_drop_point: string | null; ic_number: string | null; phone: string | null };

const maskIc = (ic: string | null) => {
  if (!ic) return '—';
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return ic;
  return `${digits.slice(0, 6)}-XX-XXXX`;
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
  const { user } = useApp();
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';

  const [selectedKey, setSelectedKey]   = useState('');
  const [bannerUrls, setBannerUrls]     = useState<Record<string, string>>({});
  const [imgError, setImgError]         = useState<Record<string, boolean>>({});
  const [uploading, setUploading]       = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [riderDir, setRiderDir]         = useState<RiderDir[]>([]);

  // Campus mapping for the directory RPC
  const CAMPUS_MAP: Record<string, string> = {
    umpsa: '', // both Pekan and Gambang — or pass '' to get all
    uitm: '', umk: '', ukm: '', uiam: '',
  };

  // Load public URLs for all universities on mount
  useEffect(() => {
    const urls: Record<string, string> = {};
    UNIVERSITIES.forEach(u => {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${u.key}.jpg`);
      urls[u.key] = data.publicUrl;
    });
    setBannerUrls(urls);
  }, []);

  const handleUniversityChange = (key: string) => {
    setSelectedKey(key);
    setImgError(prev => ({ ...prev, [key]: false }));
    if (key !== 'umpsa') { setRiderDir([]); return; }
    const campus = CAMPUS_MAP[key] ?? '';
    supabase.rpc('get_jubah_riders_directory', { p_campus: campus })
      .then(({ data }) => setRiderDir((data as RiderDir[]) ?? []));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedKey) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${selectedKey}.jpg`;
    await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setBannerUrls(prev => ({ ...prev, [selectedKey]: `${data.publicUrl}?t=${Date.now()}` }));
    setImgError(prev => ({ ...prev, [selectedKey]: false }));
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const currentBanner  = selectedKey ? bannerUrls[selectedKey] : null;
  const hasBannerError = selectedKey ? imgError[selectedKey] : false;
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
          <button
            type="button"
            onClick={() => { if (selectedKey) onProceed(selectedKey); }}
            disabled={!selectedKey}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition active:scale-90 ${
              selectedKey
                ? 'text-blue-600 hover:bg-blue-50 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <select
          value={selectedKey}
          onChange={e => handleUniversityChange(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500"
        >
          <option value="" disabled>Choose your university…</option>
          {UNIVERSITIES.map(u => (
            <option key={u.key} value={u.key}>{u.label}</option>
          ))}
        </select>

        {/* Banner area */}
        <div className="w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 h-40 flex items-center justify-center relative">
          {selectedKey && currentBanner && !hasBannerError ? (
            <img
              src={currentBanner}
              alt={`${selectedLabel} convocation banner`}
              className="w-full h-full object-cover"
              onError={() => setImgError(prev => ({ ...prev, [selectedKey]: true }))}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-300 p-4 text-center">
              <ImageIcon className="w-10 h-10" />
              <span className="text-[10px] font-bold">
                {selectedKey ? 'No banner uploaded yet' : 'Select a university to preview the banner'}
              </span>
            </div>
          )}
        </div>

        {/* Upload banner — admin/superadmin only */}
        {selectedKey && isAdmin && (
          <>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              ref={uploadRef}
              onChange={handleUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Upload Banner for {selectedLabel.split(' ').slice(-1)[0]}
                </>
              )}
            </button>
          </>
        )}
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
                  <tr key={r.id} className="border-b border-slate-50 text-[10px]">
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
                        {r.phone && (
                          <a
                            href={`https://wa.me/${toWa(r.phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[#25D366] active:scale-90 transition shrink-0"
                          >
                            <WaIcon className="w-3.5 h-3.5" />
                          </a>
                        )}
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


    </div>
  );
};
