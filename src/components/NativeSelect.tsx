import { ChevronDown } from 'lucide-react';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface NativeSelectProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  label?: string; // unused here — kept so call sites didn't all need editing when swapping in for Dropdown
  disabled?: boolean;
}

// Plain native <select> — opens the OS's own picker (a wheel on iOS, a list
// overlay on Android), so there's no custom touch/scroll/click handling left
// to get wrong. Replaces the custom bottom-sheet "Dropdown Standard" after
// repeated, hard-to-pin-down touch bugs on Android (ghost clicks landing on
// whatever was behind the sheet, tap-vs-scroll conflicts) that a real OS
// picker can't have by construction.
export function NativeSelect<T extends string>({
  value, options, onChange, placeholder = 'Select...', disabled,
}: NativeSelectProps<T>) {
  const selected = options.find(o => o.value === value);
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        disabled={disabled}
        className={`w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-3 pr-8 text-xs appearance-none disabled:opacity-50 ${
          selected ? 'font-semibold text-slate-700' : 'font-normal text-slate-400'
        }`}
      >
        <option value="" disabled hidden>{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
    </div>
  );
}
