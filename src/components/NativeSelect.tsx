import { useEffect, useRef, useState, type ElementType } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  right?: string; // optional bold value shown right-aligned in the option row (e.g. a price), matching Quick Routes' route-row layout
}

interface NativeSelectProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string; // unused — no separate sheet title needed for an inline list
  disabled?: boolean;
  // Compact icon-only trigger instead of the full-width labeled button —
  // same dropdown list and open/close behavior, just for callers that need
  // this to sit in a toolbar-style row rather than own a full-width block
  // (e.g. a university switcher next to an ON/OFF toggle).
  icon?: ElementType;
}

// Floats directly below the field (position: absolute, anchored to it) —
// not a full-screen modal sheet, and not inline (which pushed the rest of
// the page down while open). Every bug chased tonight came from the same
// root cause: a fixed, full-screen backdrop covering the ENTIRE page, so
// closing it could reveal distant, unrelated content for a stray click to
// land on. This only ever overlaps whatever's immediately nearby, and
// there's still no backdrop element at all — outside taps close it via a
// plain pointerdown listener scoped to this component's own ref, not a
// click-catching div sitting over other content.
export function NativeSelect<T extends string>({
  value, options, onChange, placeholder = 'Select...', disabled, icon: Icon,
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
    <div ref={rootRef} className={`relative ${Icon ? 'shrink-0' : 'w-full'}`}>
      {Icon ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
          aria-label={placeholder}
          className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-100 bg-white active:bg-slate-50 transition disabled:opacity-50 shrink-0"
        >
          <Icon className="w-4 h-4 text-slate-500" />
        </button>
      ) : (
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
      )}

      {open && (
        <div className={`absolute top-full z-20 mt-1.5 max-h-64 overflow-y-auto no-scrollbar flex flex-col gap-1.5 border border-slate-100 rounded-2xl p-2 bg-white shadow-lg ${
          Icon ? 'left-0 w-64' : 'left-0 right-0'
        }`}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-transform active:scale-[0.99] ${
                o.value === value ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-600'
              }`}
            >
              <span className="truncate">{o.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {o.right && <span className="font-black text-slate-800">{o.right}</span>}
                {o.value === value && <Check className="w-4 h-4 text-slate-900 shrink-0" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
