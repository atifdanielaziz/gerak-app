import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { FileImage, Upload, Trash2, Info, X, Check } from 'lucide-react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { JUBAH_UNIVERSITIES } from '../../../lib/jubahUniversities';

const BANNER_BUCKET = 'jubah-banners';
const BANNER_ITEMS = [
  { key: 'default', label: 'Default Banner (RUNNER GERAK)' },
  ...JUBAH_UNIVERSITIES.map(u => ({ key: u.key, label: u.label })),
];

interface JubahBannerSubTabProps {
  // Whether this sub-tab is the one currently visible — banner URLs are
  // (re)loaded whenever it becomes active, same as every other tab's data.
  active: boolean;
  onOpenSampleDocs: (page: { key: string; label: string }) => void;
  showToast: (msg: string) => void;
}

// Per-university Jubah promo banner management: upload, crop, and delete the
// banner image shown to customers for each campus. One fixed-path image per
// university — a new upload always replaces the previous one in place.
export function JubahBannerSubTab({ active, onOpenSampleDocs, showToast }: JubahBannerSubTabProps) {
  const [bannerUrls,       setBannerUrls]       = useState<Record<string, string>>({});
  const [bannerImgError,   setBannerImgError]   = useState<Record<string, boolean>>({});
  const [bannerRefreshKey, setBannerRefreshKey] = useState<Record<string, number>>({});
  const [bannerUploading,  setBannerUploading]  = useState<string | null>(null);
  const [bannerUploadKey,  setBannerUploadKey]  = useState<string | null>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  const [cropSrc,       setCropSrc]       = useState<string>('');
  const [cropObj,       setCropObj]       = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const cropImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!active) return;
    const urls: Record<string, string> = {};
    BANNER_ITEMS.forEach(b => {
      const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(`${b.key}.jpg`);
      urls[b.key] = `${data.publicUrl}?t=${Date.now()}`;
    });
    setBannerUrls(urls);
    setBannerImgError({});
  }, [active]);

  // [debug] Detect a silent unmount/remount right after picking a file,
  // which would reset cropSrc without any explicit close call.
  useEffect(() => {
    console.log('[debug] JubahBannerSubTab MOUNTED');
    return () => console.log('[debug] JubahBannerSubTab UNMOUNTING');
  }, []);

  const getCroppedBlob = (image: HTMLImageElement, px: PixelCrop): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth  / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width  = Math.round(px.width  * scaleX);
    canvas.height = Math.round(px.height * scaleY);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, px.x * scaleX, px.y * scaleY, px.width * scaleX, px.height * scaleY, 0, 0, canvas.width, canvas.height);
    return new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92));
  };

  const onCropImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { offsetWidth: w, offsetHeight: h } = e.currentTarget;
    const pct = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, w / h, w, h), w, h);
    setCropObj(pct);
    setCompletedCrop({ unit: 'px', x: (pct.x / 100) * w, y: (pct.y / 100) * h, width: (pct.width / 100) * w, height: (pct.height / 100) * h });
  };

  const handleBannerUpload = async (file: File) => {
    if (!bannerUploadKey) return;
    const key = bannerUploadKey;
    setBannerUploading(key);
    const path = `${key}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BANNER_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      showToast(`Banner upload failed: ${uploadError.message}`);
      setBannerUploading(null);
      return;
    }
    const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(path);
    setBannerUploading(null);
    showToast('Banner uploaded ✓');
    // Give Supabase CDN ~1s to propagate, then force fresh load
    setTimeout(() => {
      setBannerImgError(prev => ({ ...prev, [key]: false }));
      setBannerUrls(prev => ({ ...prev, [key]: `${data.publicUrl}?t=${Date.now()}` }));
      setBannerRefreshKey(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    }, 1000);
  };

  const closeCropModal = () => {
    setCropSrc('');
    setCropObj(undefined);
    setCompletedCrop(undefined);
  };

  const handleCropConfirm = async () => {
    if (!completedCrop || !cropImgRef.current || !bannerUploadKey) return;
    const blob = await getCroppedBlob(cropImgRef.current, completedCrop);
    closeCropModal();
    const file = new File([blob], `${bannerUploadKey}.jpg`, { type: 'image/jpeg' });
    handleBannerUpload(file);
  };

  const handleBannerDelete = async (key: string) => {
    const { error } = await supabase.storage.from(BANNER_BUCKET).remove([`${key}.jpg`]);
    if (error) { showToast('Delete failed: ' + error.message); return; }
    setBannerUrls(prev => ({ ...prev, [key]: '' }));
    setBannerImgError(prev => ({ ...prev, [key]: true }));
    setBannerRefreshKey(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    showToast('Banner deleted.');
  };

  console.log('[debug] JubahBannerSubTab render, cropSrc=', cropSrc ? `(${cropSrc.length} chars)` : '(empty)');

  return (
    <>
      <div className="flex flex-col gap-4">
        <input
          type="file"
          ref={bannerFileRef}
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            showToast(file ? `[debug] onChange fired, file=${file.name}` : '[debug] onChange fired, NO file');
            if (file) {
              const reader = new FileReader();
              reader.onerror = () => showToast(`[debug] FileReader error: ${String(reader.error)}`);
              reader.onload = () => {
                showToast(`[debug] FileReader onload, result length=${(reader.result as string)?.length ?? 0}`);
                setCropSrc(reader.result as string);
                setCropObj(undefined);
                setCompletedCrop(undefined);
              };
              reader.readAsDataURL(file);
            }
            if (bannerFileRef.current) bannerFileRef.current.value = '';
          }}
        />
        {BANNER_ITEMS.map(item => (
          <div key={item.key} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700 flex-1 min-w-0">{item.label}</h3>
              {item.key !== 'default' && (
                <button
                  onClick={() => onOpenSampleDocs({ key: item.key, label: item.label })}
                  className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 active:scale-90 active:bg-slate-100 transition shrink-0">
                  <Info className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="w-full h-56 rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
              {bannerUrls[item.key] && !bannerImgError[item.key] ? (
                <img
                  key={`${item.key}-${bannerRefreshKey[item.key] ?? 0}`}
                  src={bannerUrls[item.key]}
                  alt={`${item.label} banner`}
                  className="max-w-full max-h-full w-auto h-auto object-contain block"
                  onError={() => setBannerImgError(prev => ({ ...prev, [item.key]: true }))}
                />
              ) : (
                <div className="min-h-[120px] flex flex-col items-center justify-center gap-2 text-slate-300 p-4 text-center">
                  <FileImage className="w-10 h-10" />
                  <span className="text-xs font-semibold">No banner uploaded yet</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={bannerUploading === item.key}
                onClick={() => { setBannerUploadKey(item.key); setTimeout(() => bannerFileRef.current?.click(), 0); }}
                className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition text-xs font-semibold disabled:opacity-50"
              >
                {bannerUploading === item.key ? (
                  <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> Upload Banner</>
                )}
              </button>
              <button
                type="button"
                disabled={!bannerUrls[item.key] || bannerImgError[item.key]}
                onClick={() => handleBannerDelete(item.key)}
                className="flex-1 flex items-center justify-center border-2 border-dashed border-red-200 rounded-xl py-2.5 text-red-400 hover:border-red-400 hover:text-red-500 hover:bg-red-50/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Banner Crop Modal ── */}
      {/* Portalled to document.body: SwipeBackGesture's always-present
          transform (App.tsx) makes itself the containing block for every
          position:fixed element app-wide, and App.tsx's page-content wrapper
          (overflow-hidden, sits between Header and BottomNav) clips fixed
          descendants down to just that content pane. Other fixed sheets never
          exposed this since they only cover the content area anyway — this
          modal needs the full screen including where the header sits, so it
          has to render outside that ancestor chain entirely. */}
      {cropSrc && createPortal(
        <div className="fixed inset-0 z-[80] bg-black flex flex-col">
          <div className="flex items-center justify-between px-5 pb-4 shrink-0" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
            <button
              onClick={closeCropModal}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20 transition">
              <X className="w-4 h-4" />
            </button>
            <span className="text-white font-black text-sm tracking-wide">Crop Banner</span>
            <button
              onClick={handleCropConfirm}
              disabled={!completedCrop}
              className="flex items-center gap-1.5 bg-amber-400 text-black font-black text-xs px-3 py-1.5 rounded-full active:scale-95 transition disabled:opacity-40">
              <Check className="w-3.5 h-3.5" />
              Done
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden min-h-0">
            <ReactCrop
              crop={cropObj}
              onChange={c => setCropObj(c)}
              onComplete={c => setCompletedCrop(c)}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            >
              <img
                ref={cropImgRef}
                src={cropSrc}
                alt="crop preview"
                onLoad={onCropImgLoad}
                style={{ maxWidth: '100%', maxHeight: 'calc(100dvh - 160px)', objectFit: 'contain', display: 'block' }}
              />
            </ReactCrop>
          </div>

          <div className="px-4 pb-8 text-center shrink-0">
            <span className="text-white/40 text-xs">Drag corners to adjust · Free crop, any shape</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
