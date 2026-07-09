import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ConfirmModal: React.FC = () => {
  const { confirmModal, hideConfirmModal } = useApp();
  if (!confirmModal) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      onClick={hideConfirmModal}
    >
      <div
        className="w-full max-w-[320px] bg-white rounded-3xl p-6 flex flex-col items-center gap-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Ripple icon */}
        <div className="relative flex items-center justify-center w-32 h-32 mt-2 mb-1 shrink-0">
          <div className="absolute w-16 h-16 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0s' }} />
          <div className="absolute w-16 h-16 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.65s' }} />
          <div className="absolute w-16 h-16 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '1.3s' }} />
          <div className="relative z-10 w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
            <TriangleAlert className="w-7 h-7 text-white" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-800 text-center m-0">{confirmModal.title}</h2>
        <p className="text-sm font-normal text-slate-500 text-center leading-relaxed -mt-1">{confirmModal.message}</p>

        <div className="flex gap-3 w-full mt-1">
          <button
            onClick={hideConfirmModal}
            className="flex-1 py-3.5 rounded-2xl border border-primary text-primary font-semibold text-sm tracking-wide active:scale-95 transition active:bg-primary/5"
          >
            {confirmModal.cancelLabel ?? 'CANCEL'}
          </button>
          <button
            onClick={confirmModal.onConfirm}
            className="flex-1 py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm tracking-wide active:scale-95 transition shadow-md shadow-primary/25"
          >
            {confirmModal.confirmLabel ?? 'CONFIRM'}
          </button>
        </div>
      </div>
    </div>
  );
};
