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
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      style={{
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={hideAuthGate}
    >
      <div
        className="w-full max-w-[320px] bg-white rounded-3xl p-6 flex flex-col items-center gap-4 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon — outer halo + inner solid circle */}
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
            <TriangleAlert className="w-6 h-6 text-white" />
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
            className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-sm active:scale-95 transition active:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3.5 rounded-2xl bg-primary text-white font-semibold text-sm active:scale-95 transition shadow-md shadow-primary/20"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
