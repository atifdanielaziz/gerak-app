import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface NativeSelectProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string; // unused — no separate sheet title needed for an inline list
  disabled?: boolean;
}

// Expands inline, directly below the field — not a full-screen modal sheet.
// Every bug chased tonight (sheet flashing shut on open, ghost clicks
// landing on page content behind the sheet once it closed, tap-vs-scroll
// conflicts) came from the same root cause: a backdrop overlay covering
// other tappable content, with the browser's touch-to-click translation
// occasionally misfiring across that boundary. An inline list has nothing
// underneath it to ever misfire onto, so that whole class of bug can't
// happen here by construction — while still keeping the app's own card-row
// styling instead of falling back to the OS's plain <select> picker.
export function NativeSelect<T extends string>({
  value, options, onChange, placeholder = 'Select...', disabled,
}: NativeSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full bg-white border border-slate-100 rounded-xl py-2.5 px-3 flex items-center justify-between gap-2 active:bg-slate-50 transition disabled:opacity-50"
      >
        <span className={`text-xs truncate ${selected ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1.5 max-h-64 overflow-y-auto no-scrollbar flex flex-col gap-1.5 border border-slate-100 rounded-2xl p-2 bg-white shadow-lg">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-transform active:scale-[0.99] ${
                o.value === value ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-600'
              }`}
            >
              <span>{o.label}</span>
              {o.value === value && <Check className="w-4 h-4 text-slate-900 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
