import React from 'react';

// Floating Message Standard — white rounded card (Border Standard: white
// bg, border-slate-100, rounded-3xl, no shadow), centered title + muted
// description, then stacked full-width text-only rows separated by thin
// slate-100 dividers. Destructive action styled red. Different from
// ConfirmModal (side-by-side Cancel/Confirm buttons) — use this for
// multi-option prompts, e.g. "leaving with unsaved changes".
interface FloatingMessageOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface FloatingMessageProps {
  title: string;
  description?: string;
  options: FloatingMessageOption[];
  onDismiss?: () => void;
}

export const FloatingMessage: React.FC<FloatingMessageProps> = ({ title, description, options, onDismiss }) => (
  <div
    className="fixed inset-0 z-[9999] flex items-center justify-center px-8"
    style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
    onPointerDown={(e) => { e.preventDefault(); onDismiss?.(); }}
  >
    <div className="w-full max-w-[320px] bg-white border border-slate-100 rounded-3xl overflow-hidden" onPointerDown={e => e.stopPropagation()}>
      <div className="px-5 pt-5 pb-4 text-center">
        <h2 className="text-slate-900 font-semibold text-base m-0">{title}</h2>
        {description && <p className="text-slate-400 font-normal text-sm mt-1.5 leading-relaxed">{description}</p>}
      </div>
      <div className="border-t border-slate-100">
        {options.map((opt, i) => (
          <button
            key={i}
            onPointerDown={e => { e.preventDefault(); opt.onPress(); }}
            className={`w-full py-3.5 text-center text-base font-semibold active:bg-slate-50 transition-colors ${
              i < options.length - 1 ? 'border-b border-slate-100' : ''
            } ${opt.destructive ? 'text-red-500' : 'text-slate-800'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
