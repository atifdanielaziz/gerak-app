import { useEffect, useMemo, useRef, useState, type ElementType, type PointerEvent as ReactPointerEvent } from 'react';
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
  searchable?: boolean;
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
  value, options, onChange, placeholder = 'Select...', disabled, icon: Icon, searchable = false,
}: NativeSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(o => o.value === value);
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? options.filter(option => option.label.toLocaleLowerCase().includes(normalized)) : options;
  }, [options, query]);

  const selectOption = (nextValue: T) => {
    // Close first so a parent state update cannot leave the mobile menu
    // visually open after the selected value changes.
    setOpen(false);
    setQuery('');
    onChange(nextValue);
  };

  const beginOptionGesture = (event: ReactPointerEvent) => {
    gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };

  const trackOptionGesture = (event: ReactPointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    // 10px touch slop: releasing after a scroll never counts as choosing.
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) gesture.moved = true;
  };

  const finishOptionGesture = (event: ReactPointerEvent, nextValue: T) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) return;
    event.preventDefault();
    event.stopPropagation();
    selectOption(nextValue);
  };

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
          {searchable && (
            <input
              autoFocus
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search by name or Gerak ID"
              className="sticky top-0 z-10 w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs font-normal text-slate-700 outline-none focus:border-slate-900"
            />
          )}
          {visibleOptions.map(o => (
            <button
              key={o.value}
              type="button"
              onPointerDown={beginOptionGesture}
              onPointerMove={trackOptionGesture}
              onPointerCancel={() => { gestureRef.current = null; }}
              onPointerUp={(event) => finishOptionGesture(event, o.value)}
              onClick={(event) => {
                // Keyboard activation has no pointer gesture.
                if (event.detail === 0) {
                  selectOption(o.value);
                }
              }}
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
          {visibleOptions.length === 0 && <p className="px-3 py-3 text-xs font-normal text-slate-400">No matching Jubah Rider.</p>}
        </div>
      )}
    </div>
  );
}
