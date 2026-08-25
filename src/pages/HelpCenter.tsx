import React from 'react';
import { HelpCircle, Mail } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-2">
    <h3 className="text-sm font-bold text-slate-800 m-0">{title}</h3>
    <div className="text-xs text-slate-500 leading-relaxed font-normal flex flex-col gap-2">
      {children}
    </div>
  </div>
);

export const HelpCenter: React.FC = () => {
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      {/* Page Header */}
      <div className="mt-4 flex items-center gap-2 pl-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <HelpCircle className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 m-0">Help Center</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Common questions &amp; how to reach us</p>
        </div>
      </div>

      <Section title="How do I book a ride, Jubah delivery, or rental?">
        <p>
          Open the relevant service from the home screen (Gerak Car, Gerak Jubah, or Gerak Rental), fill in the
          details, and confirm your booking. You'll be able to track its status from Activity.
        </p>
      </Section>

      <Section title="How do I pay?">
        <p>
          Payment is handled through our payment gateway at the point of booking. The price shown at checkout is
          the amount charged — see our Terms &amp; Conditions for details on refunds and cancellations.
        </p>
      </Section>

      <Section title="I found a bug, or my payment didn't go through">
        <p>
          Email us your Gerak ID (or booking reference number) and a short description of what happened — we
          monitor payment mismatches manually and will follow up.
        </p>
      </Section>

      <a
        href="mailto:gerakmygroup@gmail.com"
        className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center gap-3 active:bg-slate-50 active:scale-[0.99] transition"
      >
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 m-0">Still need help?</p>
          <p className="text-xs text-slate-400 font-normal mt-0.5 truncate">gerakmygroup@gmail.com</p>
        </div>
      </a>

    </div>
  );
};
