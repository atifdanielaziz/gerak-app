import React from 'react';
import { Info, Mail, ChevronRight } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-2">
    <h3 className="text-sm font-bold text-slate-800 m-0">{title}</h3>
    <div className="text-xs text-slate-500 leading-relaxed font-normal flex flex-col gap-2">
      {children}
    </div>
  </div>
);

// Same university list as Terms/Privacy — keep in sync with universities.ts.
const UNIVERSITIES = ['UMPSA', 'UiTM', 'UMK', 'UKM', 'UIAM', 'UUM', 'UniSZA', 'UTP', 'UPM', 'UM', 'UPSI', 'UMS', 'UNIMAS'];

export const AboutGerak: React.FC = () => {
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      {/* Page Header */}
      <div className="mt-4 flex flex-col items-center text-center gap-3 px-2 pt-2">
        <img src="/gerak-brand.png" alt="Gerak" className="w-20 h-auto" />
        <div>
          <h2 className="text-lg font-bold text-slate-800 m-0">Gerak</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Smart Campus Platform</p>
        </div>
      </div>

      <Section title="What Gerak is">
        <p>
          Gerak is a campus community platform connecting students and staff as drivers, Jubah delivery riders, and
          vehicle owners — covering campus ride-hailing (Gerak Car), graduation robe booking and delivery (Gerak
          Jubah), and peer-to-peer vehicle rental (Gerak Rental).
        </p>
      </Section>

      <Section title="Universities we serve">
        <p>Currently live at {UNIVERSITIES.join(', ')}, with more campuses planned.</p>
      </Section>

      <a
        href="mailto:gerakmygroup@gmail.com"
        className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center gap-3 active:bg-slate-50 active:scale-[0.99] transition"
      >
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 m-0">Contact us</p>
          <p className="text-xs text-slate-400 font-normal mt-0.5 truncate">gerakmygroup@gmail.com</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </a>

      <div className="flex items-center gap-2 justify-center text-slate-300 text-xs font-normal pt-2">
        <Info className="w-3.5 h-3.5" />
        Gerak is built and operated by its founding team as an independent project.
      </div>

    </div>
  );
};
