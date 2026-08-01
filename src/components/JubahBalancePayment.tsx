import { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { updateJubahBalanceProof } from '../lib/sheetsService';
import { JubahQrButton } from './JubahQrButton';

export interface JubahBankDetails {
  name: string;
  account: string;
  holder: string;
}

interface JubahBalancePaymentProps {
  reference: string;
  hpNumber: string;
  fullName: string;
  balanceDue: number;
  balancePaid: boolean;
  balanceProofUrl: string | null;
  bankDetails: JubahBankDetails | null;
  riderId?: string;
  onSubmitted: (proofPathOrSubmitted: string) => void;
}

// Deposit-balance upload flow — shown from both Jubah.tsx's post-booking
// "Reservation Active" page and TrackJubah.tsx's search results. Previously
// duplicated separately in each file; extracted here so a future change to
// this flow (validation, copy, styling) only needs to happen once. Each
// instance owns its own file/submitting/error state, so TrackJubah.tsx
// rendering one per search result needs no id-keyed state of its own.
export function JubahBalancePayment({
  reference, hpNumber, fullName, balanceDue, balancePaid, balanceProofUrl, bankDetails, riderId, onSubmitted,
}: JubahBalancePaymentProps) {
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError('');

    // Upload proof to Supabase Storage — foldered by booking reference (not
    // a public URL) so the jubah-docs storage policies can verify ownership.
    // A failed upload used to fall back to storing the literal string
    // "submitted" as the proof path, which unblocked the rider/admin
    // Confirm Balance button while leaving nothing real for them to view
    // (confirmed live — a booking stuck with balance_proof_url = 'submitted'
    // and no matching object in the bucket at all). Now a failed upload
    // blocks submission entirely instead of faking a receipt that isn't there.
    let proofPath: string | undefined;
    try {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const namePart = fullName.replace(/\s+/g, '_');
      const path = `${reference}/${namePart}_balance-payment_${Date.now()}.${ext}`;
      const { data, error: storageError } = await supabase.storage
        .from('jubah-docs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (storageError || !data) throw storageError ?? new Error('Upload returned no data.');
      proofPath = data.path;
    } catch (err) {
      console.error('[GERAK] Balance proof upload failed:', err);
      setSubmitting(false);
      setError('Upload failed — please check your connection and try again.');
      return;
    }

    const { data } = await supabase.rpc('submit_jubah_balance', {
      p_reference:         reference,
      p_hp_number:         hpNumber,
      p_balance_proof_url: proofPath,
    });

    setSubmitting(false);
    if (data?.success) {
      onSubmitted(proofPath);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      updateJubahBalanceProof(reference, proofPath);
    } else {
      setError(data?.error ?? 'Submission failed. Please try again.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 ${
        balancePaid ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
      }`}>
        <div>
          <span className={`text-[8px] font-semibold block ${balancePaid ? 'text-emerald-500' : 'text-amber-500'}`}>
            {balancePaid ? 'Balance Paid' : 'Balance Due'}
          </span>
          <span className={`text-base font-black ${balancePaid ? 'text-emerald-700' : 'text-amber-700'}`}>
            RM{balanceDue.toFixed(2)}
          </span>
        </div>
        {balancePaid && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
      </div>

      {balanceProofUrl && !balancePaid && (
        <p className="text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Balance payment receipt submitted — admin will confirm shortly.
        </p>
      )}

      {!balancePaid && !balanceProofUrl && (
        <div className="flex flex-col gap-2">
          {bankDetails && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-blue-400 font-semibold">Bank Details</span>
                {riderId && <JubahQrButton riderId={riderId} />}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-400 font-semibold">Bank</span>
                <span className="font-bold text-blue-800">{bankDetails.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-400 font-semibold">Account No.</span>
                <span className="font-bold text-blue-800 font-mono">{bankDetails.account}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-400 font-semibold">Account Holder</span>
                <span className="font-bold text-blue-800">{bankDetails.holder}</span>
              </div>
              <p className="text-blue-600 font-semibold pt-1 border-t border-blue-100 mt-0.5">
                Put your reference <span className="font-mono">{reference}</span> in the transfer note.
              </p>
            </div>
          )}
          <p className="text-xs text-slate-500 font-normal">
            Ready to pay your balance? Upload proof of payment below.
          </p>
          <input
            type="file"
            accept=".pdf,application/pdf,image/jpeg,image/png"
            ref={fileRef}
            onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); }}
            className="hidden"
          />
          {!file ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-amber-200 rounded-xl py-3 flex items-center justify-center gap-2 text-amber-500 hover:border-amber-400 hover:bg-amber-50/50 transition"
            >
              <Upload className="w-4 h-4" />
              <span className="text-xs font-semibold">Upload Balance Payment Receipt</span>
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 truncate">{file.name}</p>
                  <p className="text-xs text-emerald-500 font-normal">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-slate-400 hover:text-danger transition shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] disabled:bg-slate-200 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Submitting…</>
                  : 'Submit Balance Payment'}
              </button>
            </div>
          )}
          {error && <p className="text-xs text-danger font-semibold">{error}</p>}
        </div>
      )}
    </div>
  );
}
