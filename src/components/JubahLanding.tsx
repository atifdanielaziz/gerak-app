import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { ChevronRight, Upload, Image as ImageIcon } from 'lucide-react';

const UNIVERSITIES = [
  { key: 'umpsa', label: 'Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)' },
  { key: 'uitm',  label: 'Universiti Teknologi MARA (UiTM)' },
  { key: 'umk',   label: 'Universiti Malaysia Kelantan (UMK)' },
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
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4">

      {/* Header */}
      <div className="mt-4 px-1">
        <h2 className="text-xl font-black m-0 text-slate-800">Jubah Delivery</h2>
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">
          Select your university to continue
        </p>
      </div>

      {/* University selector + banner */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Select University</h3>

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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Proceed — bottom right */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { if (selectedKey) onProceed(selectedKey); }}
          disabled={!selectedKey}
          className={`flex items-center gap-2 px-7 py-3 rounded-full text-sm font-extrabold transition-all duration-200 active:scale-95 ${
            selectedKey
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/30 cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          Proceed
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
};
