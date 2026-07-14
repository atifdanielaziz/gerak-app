import React from 'react';

// Floating Message Standard — dark rounded card, centered title + muted
// description, then stacked full-width text-only rows (no button pills/
// borders) separated by thin dividers. Destructive action styled red.
// Different from ConfirmModal (white card, side-by-side Cancel/Confirm) —
// use this for multi-option prompts, e.g. "leaving with unsaved changes".
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
    style={{ background: 'rgba(0,0,0,0.5)' }}
    onClick={onDismiss}
  >
    <div className="w-full max-w-[320px] bg-[#1c1c1e] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="px-5 pt-5 pb-4 text-center">
        <h2 className="text-white font-semibold text-base m-0">{title}</h2>
        {description && <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">{description}</p>}
      </div>
      <div className="border-t border-white/10">
        {options.map((opt, i) => (
          <button
            key={i}
            onPointerDown={e => { e.preventDefault(); opt.onPress(); }}
            className={`w-full py-3.5 text-center text-base font-medium active:bg-white/10 transition-colors ${
              i < options.length - 1 ? 'border-b border-white/10' : ''
            } ${opt.destructive ? 'text-red-500' : 'text-white'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
