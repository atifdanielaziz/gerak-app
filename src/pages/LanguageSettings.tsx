import React from 'react';
import { Languages, Check } from 'lucide-react';

export const LanguageSettings: React.FC = () => {
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      <div className="mt-4 flex items-center gap-2 pl-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Languages className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 m-0">Language</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Choose your display language</p>
        </div>
      </div>

      <div className="bg-white border border-slate-900 rounded-2xl flex items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold text-slate-800">English</span>
        <Check className="w-4 h-4 text-primary" />
      </div>

      <p className="text-xs text-slate-400 font-normal text-center px-6 leading-relaxed">
        More languages, including Bahasa Malaysia, are coming soon.
      </p>

    </div>
  );
};
