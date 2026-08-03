import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { FileImage, Upload, Trash2, Info, X, Check } from 'lucide-react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { JUBAH_UNIVERSITIES } from '../../../lib/jubahUniversities';

const BANNER_BUCKET = 'jubah-banners';
const MAX_IMAGES_PER_UNIVERSITY = 10;
const BANNER_ITEMS = [
  { key: 'default', label: 'Default Banner (RUNNER GERAK)' },
  ...JUBAH_UNIVERSITIES.map(u => ({ key: u.key, label: u.label })),
];

type BannerImage = { id: string; university_key: string; storage_path: string; position: number };

interface JubahBannerSubTabProps {
  // Whether this sub-tab is the one currently visible — banner URLs are
  // (re)loaded whenever it becomes active, same as every other tab's data.
  active: boolean;
  onOpenSampleDocs: (page: { key: string; label: string }) => void;
  showToast: (msg: string) => void;
}

// Per-university Jubah promo banner management: upload (up to
// MAX_IMAGES_PER_UNIVERSITY images each), crop, and delete individual
// banner images shown to customers as a swipeable carousel on the landing
// page. Previously one fixed-path image per university (upload always
// replaced it) — now a real jubah_banner_images row per image, ordered by
// upload order (position), no drag-reorder.
export function JubahBannerSubTab({ active, onOpenSampleDocs, showToast }: JubahBannerSubTabProps) {
  const [images, setImages] = useState<Record<string, BannerImage[]>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadTargetKey, setUploadTargetKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // Per-university carousel position — same swipe mechanic as the customer
  // Jubah landing page's banner carousel (JubahLanding.tsx), so admin sees
  // banners exactly as customers will.
  const [activeIdx, setActiveIdx] = useState<Record<string, number>>({});
  const touchStartX = useRef(0);
  const touchEndX   = useRef(0);

  const onCarouselTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onCarouselTouchEnd = (e: React.TouchEvent, key: string, length: number) => {
    if (length <= 1) return;
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      setActiveIdx(prev => {
        const cur = prev[key] ?? 0;
        const next = diff > 0 ? (cur + 1) % length : (cur - 1 + length) % length;
        return { ...prev, [key]: next };
      });
    }
  };

  const [cropSrc,       setCropSrc]       = useState<string>('');
  const [cropObj,       setCropObj]       = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const cropImgRef = useRef<HTMLImageElement>(null);

  const loadImages = async () => {
    const { data } = await supabase
      .from('jubah_banner_images')
      .select('id, university_key, storage_path, position')
      .order('position');
    const grouped: Record<string, BannerImage[]> = {};
    const urls: Record<string, string> = {};
    (data as BannerImage[] ?? []).forEach(img => {
      (grouped[img.university_key] ??= []).push(img);
      urls[img.id] = supabase.storage.from(BANNER_BUCKET).getPublicUrl(img.storage_path).data.publicUrl;
    });
    setImages(grouped);
    setImageUrls(urls);
  };

  useEffect(() => {
    if (!active) return;
    queueMicrotask(() => { loadImages(); });
  }, [active]);

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
    if (!uploadTargetKey) return;
    const key = uploadTargetKey;
    setUploading(key);
    const existing = images[key] ?? [];
    const path = `${key}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(BANNER_BUCKET).upload(path, file, { contentType: file.type });
    if (uploadError) {
      showToast(`Banner upload failed: ${uploadError.message}`);
      setUploading(null);
      return;
    }
    const nextPosition = existing.length > 0 ? Math.max(...existing.map(i => i.position)) + 1 : 0;
    const { error: insertError } = await supabase.from('jubah_banner_images')
      .insert({ university_key: key, storage_path: path, position: nextPosition });
    setUploading(null);
    if (insertError) {
      showToast(`Banner save failed: ${insertError.message}`);
      await supabase.storage.from(BANNER_BUCKET).remove([path]);
      return;
    }
    showToast('Banner uploaded ✓');
    // Jump the carousel to the just-added image — it's appended at the end
    // (nextPosition), so without this the view stays on whatever slide it
    // was already showing and the new upload looks like it never appeared.
    setActiveIdx(prev => ({ ...prev, [key]: existing.length }));
    await loadImages();
  };

  const closeCropModal = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc('');
    setCropObj(undefined);
    setCompletedCrop(undefined);
  };

  const handleCropConfirm = async () => {
    if (!completedCrop || !cropImgRef.current || !uploadTargetKey) return;
    const blob = await getCroppedBlob(cropImgRef.current, completedCrop);
    closeCropModal();
    const file = new File([blob], `${uploadTargetKey}.jpg`, { type: 'image/jpeg' });
    handleBannerUpload(file);
  };

  const handleImageDelete = async (img: BannerImage) => {
    setDeletingId(img.id);
    const { error: deleteRowError } = await supabase.from('jubah_banner_images').delete().eq('id', img.id);
    if (deleteRowError) {
      showToast('Delete failed: ' + deleteRowError.message);
      setDeletingId(null);
      return;
    }
    await supabase.storage.from(BANNER_BUCKET).remove([img.storage_path]);
    setDeletingId(null);
    showToast('Banner deleted.');
    await loadImages();
  };

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
            if (file) {
              // Object URL instead of FileReader.readAsDataURL — a data URL
              // holds the whole photo as a giant base64 string in memory,
              // which on iOS standalone PWAs raises the odds of the WebView
              // being reloaded (losing this in-progress crop) right as it
              // hands off to the native photo picker.
              setCropSrc(URL.createObjectURL(file));
              setCropObj(undefined);
              setCompletedCrop(undefined);
            }
            if (bannerFileRef.current) bannerFileRef.current.value = '';
          }}
        />
        {BANNER_ITEMS.map(item => {
          const itemImages = images[item.key] ?? [];
          const atLimit = itemImages.length >= MAX_IMAGES_PER_UNIVERSITY;
          const curIdx = itemImages.length > 0 ? Math.min(activeIdx[item.key] ?? 0, itemImages.length - 1) : 0;
          const curImg = itemImages[curIdx];
          return (
          <div key={item.key} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700 flex-1 min-w-0">
                {item.label} <span className="text-xs font-normal text-slate-400">({itemImages.length}/{MAX_IMAGES_PER_UNIVERSITY})</span>
              </h3>
              {item.key !== 'default' && (
                <button
                  onClick={() => onOpenSampleDocs({ key: item.key, label: item.label })}
                  className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 active:scale-90 active:bg-slate-100 transition shrink-0">
                  <Info className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {itemImages.length > 0 && curImg ? (
              <div
                className="relative w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50"
                style={{ aspectRatio: '16 / 9' }}
                onTouchStart={onCarouselTouchStart}
                onTouchEnd={e => onCarouselTouchEnd(e, item.key, itemImages.length)}
              >
                {itemImages.map((img, idx) => (
                  <img
                    key={img.id}
                    src={imageUrls[img.id]}
                    alt={`${item.label} banner ${idx + 1}`}
                    className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
                      idx === curIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  />
                ))}

                <button
                  type="button"
                  disabled={deletingId === curImg.id}
                  onClick={() => handleImageDelete(curImg)}
                  className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition disabled:opacity-50"
                >
                  {deletingId === curImg.id
                    ? <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>

                {itemImages.length > 1 && (
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
                    {itemImages.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onPointerDown={e => { e.preventDefault(); setActiveIdx(prev => ({ ...prev, [item.key]: idx })); }}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === curIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-40 rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-300">
                <FileImage className="w-10 h-10" />
                <span className="text-xs font-semibold">No banners uploaded yet</span>
              </div>
            )}

            <button
              type="button"
              disabled={uploading === item.key || atLimit}
              onClick={() => { setUploadTargetKey(item.key); setTimeout(() => bannerFileRef.current?.click(), 0); }}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition text-xs font-semibold disabled:opacity-50"
            >
              {uploading === item.key ? (
                <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" /> Uploading…</>
              ) : atLimit ? (
                <>Maximum {MAX_IMAGES_PER_UNIVERSITY} images reached</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Add Banner Image</>
              )}
            </button>
          </div>
          );
        })}
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
