import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AuthGateModal: React.FC = () => {
  const { authGateVisible, hideAuthGate, setCurrentPage } = useApp();

  if (!authGateVisible) return null;

  const handleConfirm = () => {
    hideAuthGate();
    setCurrentPage('login');
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center pb-24 px-6"
      style={{
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
      onClick={hideAuthGate}
    >
      <div
        className="w-full max-w-[360px] bg-white rounded-3xl p-6 flex flex-col items-center gap-4 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon — radial glow halo + solid inner circle */}
        <div className="relative flex items-center justify-center mt-2 mb-1">
          {/* Outer radial glow ring */}
          <div
            className="absolute w-24 h-24 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.06) 55%, transparent 75%)',
            }}
          />
          {/* Inner solid circle */}
          <div className="relative w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <TriangleAlert className="w-7 h-7 text-white" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-slate-800 text-center m-0">Login Required</h2>

        {/* Description */}
        <p className="text-sm font-normal text-slate-500 text-center leading-relaxed -mt-1">
          Sign in to book rides and access all Gerak services.
        </p>

        {/* Buttons */}
        <div className="flex gap-3 w-full mt-1">
          <button
            onClick={hideAuthGate}
            className="flex-1 py-3.5 rounded-2xl border border-primary text-primary font-semibold text-sm tracking-wide active:scale-95 transition active:bg-primary/5"
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm tracking-wide active:scale-95 transition shadow-md shadow-primary/25"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
};
