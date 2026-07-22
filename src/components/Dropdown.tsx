import { useState } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string; // sheet header title; defaults to placeholder
  disabled?: boolean;
}

// "Dropdown Standard" — replaces native <select> everywhere except the
// header's Campus selector (kept as its own Plain Selector Button).
// Trigger matches Field Standard (white/bordered/press feedback); the
// options list opens as a Bare Drawer bottom sheet with Solo Card Standard
// rows, matching every other picker sheet in the app instead of relying on
// the OS's native dropdown chrome.
export function Dropdown<T extends string>({
  value, options, onChange, placeholder = 'Select...', label, disabled,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => { e.preventDefault(); if (!disabled) setOpen(true); }}
        className="w-full bg-white border border-slate-100 rounded-xl py-2.5 px-3 flex items-center justify-between gap-2 active:bg-slate-50 transition disabled:opacity-50"
      >
        <span className={`text-xs truncate ${selected ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onPointerDown={(e) => { e.preventDefault(); setOpen(false); }}
        >
          <div
            className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
              <p className="text-sm font-semibold text-slate-800">{label ?? placeholder}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 flex flex-col gap-1.5"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            >
              {options.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border text-xs font-semibold text-left transition-transform active:scale-[0.99] ${
                    o.value === value ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-600'
                  }`}
                >
                  <span>{o.label}</span>
                  {o.value === value && <Check className="w-4 h-4 text-slate-900 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
