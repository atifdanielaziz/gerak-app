import type { InputHTMLAttributes } from 'react';

interface AdminSearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function AdminSearchInput({ value, onChange, className = '', ...props }: AdminSearchInputProps) {
  return (
    <input
      {...props}
      type="text"
      value={value}
      onChange={event => onChange(event.target.value)}
      className={`w-full min-w-0 bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-normal text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-slate-900 transition-colors ${className}`}
    />
  );
}
