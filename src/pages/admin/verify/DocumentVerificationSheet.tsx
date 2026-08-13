import { useEffect, useState } from 'react';
import { ExternalLink, FileCheck2, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { decideDocuments } from '../../../lib/documentVerification';

type ReviewProfile = {
  id: string;
  name: string;
  gerak_id: string;
  role: string;
  campus: string;
  license_url: string | null;
  docs_status: string;
  docs_reject_reason: string | null;
};

interface Props {
  userId: string;
  onClose: () => void;
  onUpdated: () => void;
  showToast: (message: string) => void;
}

export function DocumentVerificationSheet({ userId, onClose, onUpdated, showToast }: Props) {
  const [profile, setProfile] = useState<ReviewProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.from('profiles')
      .select('id,name,gerak_id,role,campus,license_url,docs_status,docs_reject_reason')
      .eq('id', userId)
      .single<ReviewProfile>()
      .then(({ data }) => {
        if (!alive) return;
        setProfile(data ?? null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId]);

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!profile) return;
    setSubmitting(true);
    const result = await decideDocuments(profile.id, decision, reason);
    setSubmitting(false);
    if (!result.success) {
      showToast(result.error ?? 'Could not update document status.');
      return;
    }
    showToast(result.emailSent === false
      ? `Documents ${decision}. Email could not be sent.`
      : `Documents ${decision}. Email sent.`);
    onUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onPointerDown={e => { e.preventDefault(); onClose(); }}>
      <div className="w-full max-w-sm max-h-[calc(100dvh-5rem)] overflow-y-auto no-scrollbar bg-white rounded-t-3xl shadow-2xl animate-slide-up pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
        onPointerDown={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white px-5 pt-3 pb-3 border-b border-slate-100">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileCheck2 className="w-5 h-5 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800">Verify Documents</h3>
                <p className="text-xs font-normal text-slate-400">Review the uploaded driving licence</p>
              </div>
            </div>
            <button type="button" onPointerDown={e => { e.preventDefault(); onClose(); }}
              className="w-8 h-8 flex items-center justify-center text-slate-400 active:scale-95 transition-transform transform-gpu">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-10"><span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" /></div>
          ) : !profile ? (
            <p className="text-xs font-normal text-slate-400 text-center py-8">Profile could not be loaded.</p>
          ) : (
            <>
              <div className="bg-white border border-slate-100 rounded-2xl p-4">
                <p className="text-sm font-semibold text-slate-800">{profile.name}</p>
                <p className="text-xs font-normal text-slate-400 mt-0.5">{profile.gerak_id} · {profile.role === 'rider' ? 'Rider' : 'Driver'} · {profile.campus}</p>
                <p className="text-xs font-normal text-slate-400 mt-2 capitalize">Status: {profile.docs_status}</p>
              </div>

              <a href={profile.license_url ?? '#'} target="_blank" rel="noopener noreferrer"
                className={`w-full bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between text-xs font-semibold active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu ${!profile.license_url ? 'pointer-events-none opacity-40' : 'text-slate-700'}`}>
                <span className="flex items-center gap-2"><ExternalLink className="w-4 h-4 text-slate-400" /> View Driving Licence</span>
                <span className="text-slate-400">Open</span>
              </a>

              {profile.docs_reject_reason && (
                <div className="bg-white border border-slate-100 rounded-2xl p-4">
                  <p className="text-xs font-normal text-slate-400">Latest rejection reason</p>
                  <p className="text-xs font-semibold text-slate-700 mt-1">{profile.docs_reject_reason}</p>
                </div>
              )}

              {showReject && (
                <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-3">
                  <label className="text-xs font-semibold text-slate-700">Reason for rejection</label>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                    placeholder="Explain what needs to be corrected"
                    className="w-full resize-none bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-normal text-slate-700 focus:outline-none focus:border-slate-900" />
                  <div className="flex gap-2">
                    <button type="button" onPointerDown={e => { e.preventDefault(); setShowReject(false); setReason(''); }}
                      className="flex-1 bg-white border border-slate-100 rounded-xl py-2.5 text-xs font-semibold text-slate-600 active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu">Cancel</button>
                    <button type="button" disabled={submitting || !reason.trim()} onPointerDown={e => { e.preventDefault(); void decide('rejected'); }}
                      className="flex-1 bg-primary text-white rounded-xl py-2.5 text-xs font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform transform-gpu">Confirm Reject</button>
                  </div>
                </div>
              )}

              {!showReject && profile.license_url && (
                <div className="flex gap-2">
                  {profile.docs_status !== 'approved' && (
                    <button type="button" disabled={submitting} onPointerDown={e => { e.preventDefault(); void decide('approved'); }}
                      className="flex-1 bg-slate-900 text-white rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-transform transform-gpu">
                      <ShieldCheck className="w-4 h-4" /> Approve
                    </button>
                  )}
                  <button type="button" disabled={submitting} onPointerDown={e => { e.preventDefault(); setShowReject(true); setReason(''); }}
                    className="flex-1 bg-white border border-slate-100 rounded-xl py-3 text-xs font-semibold text-primary flex items-center justify-center gap-2 disabled:opacity-40 active:bg-slate-50 active:scale-[0.99] transition-transform transform-gpu">
                    <ShieldOff className="w-4 h-4" /> {profile.docs_status === 'approved' ? 'Revoke Approval' : 'Reject'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
