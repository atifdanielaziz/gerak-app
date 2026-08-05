import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectProps<T extends string> {
  values: T[];
  options: MultiSelectOption<T>[];
  onChange: (values: T[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Same Dropdown Standard visual language as NativeSelect (bordered trigger
// + floating panel, close on outside pointerdown) but for fields where more
// than one option can be active at once (e.g. Invite Staff's Capabilities)
// — NativeSelect's single-value contract doesn't fit that, so this is a
// separate sibling component rather than an overloaded prop shape on it.
// The one behavioral difference: tapping an option here toggles it and
// keeps the panel open, since picking one option is rarely the end of the
// interaction the way it is for a single-select.
export function MultiSelect<T extends string>({
  values, options, onChange, placeholder = 'Select...', disabled,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);

  const toggle = (v: T) => {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };

  const summary =
    values.length === 0 ? placeholder :
    values.length <= 2 ? options.filter(o => values.includes(o.value)).map(o => o.label).join(', ') :
    `${values.length} selected`;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full bg-white border border-slate-100 rounded-xl py-2.5 px-3 flex items-center justify-between gap-2 active:bg-slate-50 transition disabled:opacity-50"
      >
        <span className={`text-xs truncate ${values.length ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}`}>
          {summary}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full z-20 mt-1.5 max-h-64 overflow-y-auto no-scrollbar flex flex-col gap-1.5 border border-slate-100 rounded-2xl p-2 bg-white shadow-lg left-0 right-0">
          {options.map(o => {
            const checked = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-transform active:scale-[0.99] ${
                  checked ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-600'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {checked && <Check className="w-4 h-4 text-slate-900 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
