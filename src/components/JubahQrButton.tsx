import { useRef, useState } from 'react';
import { QrCode, Upload, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';

const QR_BUCKET = 'jubah-qr';
const QR_PATH = 'qr.jpg';

interface JubahQrButtonProps {
  // Shows Upload/Replace/Delete controls in the sheet. Real enforcement is
  // server-side (storage RLS: superadmin only) — this only controls whether
  // THIS instance renders the controls.
  canManage?: boolean;
  showToast?: (msg: string) => void;
}

// Payment QR code for the one shared Jubah bank account, so customers can
// scan instead of typing account numbers. upsert:true so a new upload
// overwrites the old file in place — nothing orphaned to separately
// delete — plus a cache-busting query param.
export function JubahQrButton({ canManage = false, showToast }: JubahQrButtonProps) {
  const { showConfirmModal } = useApp();
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  // Stable across mounts (not Date.now()) — the old per-mount value meant
  // every single visit to a page rendering this component produced a new
  // URL, bypassing any browser/CDN cache even when the QR hadn't changed
  // since the last visit. Only bumped explicitly after a real upload/
  // delete below, which is the only time a fresh fetch is actually needed.
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const qrPath = QR_PATH;
  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(qrPath);
  const url = refreshKey ? `${data.publicUrl}?t=${refreshKey}` : data.publicUrl;

  const handleUpload = async (file: File) => {
    setUploading(true);
    const { error } = await supabase.storage
      .from(QR_BUCKET)
      .upload(qrPath, file, { upsert: true, contentType: file.type, cacheControl: '31536000' });
    setUploading(false);
    if (error) { showToast?.(`QR upload failed: ${error.message}`); return; }
    showToast?.('Payment QR updated ✓');
    // Give Supabase CDN ~1s to propagate, then force a fresh load
    setTimeout(() => { setImgError(false); setRefreshKey(Date.now()); }, 1000);
  };

  const handleDelete = async () => {
    const { error } = await supabase.storage.from(QR_BUCKET).remove([qrPath]);
    if (error) { showToast?.('Delete failed: ' + error.message); return; }
    setImgError(true);
    setRefreshKey(Date.now());
    showToast?.('Payment QR deleted.');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-100 text-slate-500 active:scale-90 transition shrink-0"
      >
        <QrCode className="w-3.5 h-3.5" />
      </button>

      {open && (
        // Floating Message Standard — centered card + heavy-blur backdrop,
        // not a bottom drawer (Sheet/Drawer Standard is for full-height,
        // scrollable content; this is a small fixed-size preview+actions
        // card, same category as ConfirmModal/FloatingMessage).
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          onPointerDown={(e) => { e.preventDefault(); setOpen(false); }}
        >
          <div
            className="w-full max-w-[360px] max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white border border-slate-100 rounded-3xl flex flex-col"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Payment QR
              </span>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-5 flex flex-col gap-4">
              <div className="w-full aspect-square rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                {!imgError ? (
                  <img
                    key={refreshKey}
                    src={url}
                    alt="Payment QR code"
                    className="max-w-full max-h-full w-auto h-auto object-contain block"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-300 p-4 text-center">
                    <QrCode className="w-10 h-10" />
                    <span className="text-xs font-semibold">No QR uploaded yet</span>
                  </div>
                )}
              </div>

              {canManage && (
                <>
                  <input
                    type="file"
                    ref={fileRef}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-2.5 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition text-xs font-semibold disabled:opacity-50"
                    >
                      {uploading ? (
                        <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" /> Uploading…</>
                      ) : (
                        <><Upload className="w-3.5 h-3.5" /> {imgError ? 'Upload QR' : 'Replace QR'}</>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={imgError}
                      onClick={() => showConfirmModal({
                        title: 'Delete Payment QR?',
                        message: 'Customers will no longer see a QR to scan for this payment method. This can\'t be undone.',
                        confirmLabel: 'DELETE',
                        onConfirm: handleDelete,
                      })}
                      className="flex-1 flex items-center justify-center border-2 border-dashed border-red-200 rounded-xl py-2.5 text-red-400 hover:border-red-400 hover:text-red-500 hover:bg-red-50/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
