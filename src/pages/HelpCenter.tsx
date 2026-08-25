import React from 'react';
import { HelpCircle, Mail, FileText, Lock, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-2">
    <h3 className="text-sm font-bold text-slate-800 m-0">{title}</h3>
    <div className="text-xs text-slate-500 leading-relaxed font-normal flex flex-col gap-2">
      {children}
    </div>
  </div>
);

export const HelpCenter: React.FC = () => {
  const { setCurrentPage } = useApp();

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

      <Section title="How do I cancel a booking?">
        <p>
          Gerak Car rides can be cancelled within a short window after a driver accepts (shown in-app at the time).
          Jubah bookings are free to cancel before the deposit is paid — once paid, the deposit is non-refundable.
          Rental cancellations follow the terms shown at the time of booking, which can vary by vehicle owner.
        </p>
      </Section>

      <Section title="How do I track my Jubah order?">
        <p>
          Go to Dashboard → Track My Order, then enter either your reference number or your IC number — you don't
          need both.
        </p>
      </Section>

      <Section title="Is the Jubah deposit refundable?">
        <p>
          No — the deposit is non-refundable once paid, disclosed clearly before you pay. Any remaining balance is
          only charged when you choose to pay it, and is refundable if the booking is cancelled before that.
        </p>
      </Section>

      <Section title="How do I update my profile or change my password?">
        <p>
          Go to Profile → My Profile to edit your details, or Profile → Security Settings to change your password.
        </p>
      </Section>

      <Section title="How do I delete my account?">
        <p>
          Go to Profile and scroll to the bottom for Delete Account. This files a request to permanently delete
          your account and data — see our Privacy Policy for details.
        </p>
      </Section>

      <Section title="Which universities does Gerak support?">
        <p>
          Currently UMPSA, UiTM, UMK, UKM, UIAM, UUM, UniSZA, UTP, UPM, UM, UPSI, UMS, and UNIMAS, with more campuses planned.
        </p>
      </Section>

      <Section title="I found a bug, or my payment didn't go through">
        <p>
          Email us your Gerak ID (or booking reference number) and a short description of what happened — we
          monitor payment mismatches manually and will follow up.
        </p>
      </Section>

      <div>
        <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Policies</p>
        <div className="flex flex-col gap-2">
          {([
            { icon: FileText, label: 'Terms & Conditions', onClick: () => setCurrentPage('terms-of-service') },
            { icon: Lock, label: 'Privacy Policy', onClick: () => setCurrentPage('privacy-policy') },
          ] as { icon: React.ElementType; label: string; onClick: () => void }[]).map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-900" /></div>
                <span className="text-sm font-semibold text-slate-800">{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </div>
      </div>

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
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </a>

    </div>
  );
};
