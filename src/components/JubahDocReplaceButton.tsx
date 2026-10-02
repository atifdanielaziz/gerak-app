import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { uploadJubahDocReplacement, type JubahDocField, type ReplaceResult, type CombineResult } from '../lib/jubahDocs';

// Exported so a caller whose showToast needs to distinguish success from
// failure (TrackJubah.tsx's inline message, since it has no real toast
// system) can match on this exact string instead of guessing.
export const DOC_REPLACE_SUCCESS_MSG = 'Document replaced.';

interface JubahDocReplaceButtonProps {
  // Folder the replacement upload goes into — always the booking's
  // reference, same convention the original booking form's uploads use.
  reference: string;
  field: JubahDocField;
  // Actually performs the DB repoint — customer/rider/superadmin each call
  // a different RPC (see jubahDocs.ts), so the caller supplies it rather
  // than this component picking one.
  onReplace: (field: JubahDocField, newPath: string) => Promise<ReplaceResult>;
  onSuccess: (newPath: string) => void;
  // Re-merges the 4 current docs into a fresh Combined PDF right after a
  // successful replace, so it doesn't silently go stale. Optional because
  // it needs server-side Storage access (see jubahDocs.ts's
  // regenerateJubahCombinedPdf) — each caller wires its own
  // identity-appropriate call (reference+IC for customer, bookingId for
  // staff) rather than this component guessing which.
  onRegenerateCombined?: () => Promise<CombineResult>;
  onCombinedUpdated?: (newPath: string) => void;
  showToast: (msg: string) => void;
}

// Small icon-only button that uploads a replacement file straight to
// Storage, then calls the caller's RPC to repoint the booking's DB column
// at it. Rendered as `null` by the caller once the booking's Robe Status
// has passed 'paid' — that lock is enforced server-side in the RPC too, so
// hiding the button here is just UX, not the real security boundary.
export const JubahDocReplaceButton: React.FC<JubahDocReplaceButtonProps> = ({ reference, field, onReplace, onSuccess, onRegenerateCombined, onCombinedUpdated, showToast }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    const { path, error: uploadError } = await uploadJubahDocReplacement(reference, field, file);
    if (!path) {
      setBusy(false);
      showToast(uploadError ? `Upload failed: ${uploadError}` : 'Upload failed.');
      return;
    }
    const result = await onReplace(field, path);
    if (!result.success) {
      setBusy(false);
      showToast(result.error ?? 'Replace failed.');
      return;
    }
    onSuccess(path);

    if (onRegenerateCombined) {
      const combined = await onRegenerateCombined();
      setBusy(false);
      if (combined.success && combined.path) {
        onCombinedUpdated?.(combined.path);
        showToast(DOC_REPLACE_SUCCESS_MSG);
      } else {
        showToast(`Document replaced, but Combined PDF couldn't be updated: ${combined.error ?? 'unknown error'}`);
      }
    } else {
      setBusy(false);
      showToast(DOC_REPLACE_SUCCESS_MSG);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label="Replace document"
        title="Replace document"
        className="w-8 h-8 flex items-center justify-center rounded-lg border bg-white border-slate-200 text-slate-500 hover:bg-slate-50 active:scale-95 transition disabled:opacity-50 shrink-0"
      >
        {busy
          ? <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />}
      </button>
    </>
  );
};
