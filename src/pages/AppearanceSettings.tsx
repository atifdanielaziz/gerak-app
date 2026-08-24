import React from 'react';
import { Moon, Sun, Check } from 'lucide-react';

export const AppearanceSettings: React.FC = () => {
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      <div className="mt-4 flex items-center gap-2 pl-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Moon className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 m-0">Appearance</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Choose how Gerak looks</p>
        </div>
      </div>

      <div className="bg-white border border-primary/20 bg-primary/5 rounded-2xl flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <Sun className="w-4 h-4 text-slate-700" />
          <span className="text-sm font-semibold text-slate-800">Light</span>
        </div>
        <Check className="w-4 h-4 text-primary" />
      </div>

      <p className="text-xs text-slate-400 font-normal text-center px-6 leading-relaxed">
        Dark mode is coming soon.
      </p>

    </div>
  );
};
