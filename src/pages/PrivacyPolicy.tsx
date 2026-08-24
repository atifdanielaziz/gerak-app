import React from 'react';
import { Lock } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-2">
    <h3 className="text-sm font-bold text-slate-800 m-0">{title}</h3>
    <div className="text-xs text-slate-500 leading-relaxed font-normal flex flex-col gap-2">
      {children}
    </div>
  </div>
);

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      {/* Page Header */}
      <div className="mt-4 flex items-center gap-2 pl-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 m-0">Privacy Policy</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Last updated: 24 August 2026</p>
        </div>
      </div>

      <Section title="1. Who we are">
        <p>
          Gerak ("Gerak", "we", "us", "our") operates a campus platform for students and staff at the universities
          we serve — currently UMPSA, UiTM, UMK, UKM, UIAM, UUM, UniSZA, UTP, UPM, UM, and UPSI, with more campuses
          planned — covering campus ride-hailing ("Gerak Transport"), graduation robe booking and delivery ("Gerak Jubah"),
          and peer-to-peer vehicle rental ("Gerak Rental").
        </p>
        <p>
          Gerak is currently built and operated by its founding team as an independent project — it is not yet a
          registered company. Personal data collected through the app is handled with the same care and PDPA
          obligations that would apply to a registered business.
        </p>
        <p>
          Contact for any privacy question or request: <strong>gerakmygroup@gmail.com</strong>
        </p>
        <p>
          This policy is written to comply with Malaysia's <strong>Personal Data Protection Act 2010 (PDPA)</strong>.
          It does not apply Regulation-specific EU/UK terms (e.g. GDPR) since Gerak does not knowingly process data
          of individuals located in the EU/UK.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p><strong>Account &amp; identity:</strong> full name, matric number, IC/MyKad number (only where you provide one, or as part of a Jubah booking — see below), phone number, email address, university, faculty, campus, and gender.</p>
        <p><strong>Verification documents:</strong> drivers and Jubah riders — a driving licence image, uploaded for admin review. Neither role is required to provide an IC for this.</p>
        <p><strong>Jubah booking data:</strong> robe type, chosen collection/postage method, delivery address (postage orders only), and uploaded academic documents (OSCAR, SKPG, convocation slip) required by your university.</p>
        <p><strong>Transport &amp; rental data:</strong> pickup/destination locations, ride notes, passenger count, vehicle details, booking dates and times.</p>
        <p><strong>Payment records:</strong> booking amount, payment status and reference numbers from our payment processor. We do not receive or store your card/bank credentials — these are handled directly by our payment gateway.</p>
        <p><strong>Communications:</strong> messages you send us for support, and account-deletion requests.</p>
        <p><strong>Technical data:</strong> device type and app version, kept locally on your device (see "Local Storage" below) to save form drafts and keep you logged in — we do not use third-party analytics or advertising trackers.</p>
      </Section>

      <Section title="3. Why we collect it">
        <p>To create and manage your account, verify your eligibility as a student or staff member of a university we serve, and match you with drivers, riders, or rental owners.</p>
        <p>To process payments and issue receipts for services you book.</p>
        <p>To verify driver and rider driving licences before granting them access to carry passengers or handle deliveries — this protects everyone using the platform.</p>
        <p>Gender is used only to support an optional "prefer a female driver" matching preference for ride bookings — it is not used for any other purpose, and once set on your account it cannot be changed except by contacting us.</p>
        <p>To communicate booking updates, respond to support requests, and send service-related notifications.</p>
        <p>To detect and prevent fraud, abuse, or violations of our Terms of Service.</p>
      </Section>

      <Section title="4. Who we share it with">
        <p><strong>Payment processor:</strong> booking reference, amount, and your phone number, to process payment and confirm it back to us.</p>
        <p><strong>Cloud infrastructure:</strong> our database and file storage provider — they host your data on our behalf under their own security and data-processing terms.</p>
        <p><strong>Email delivery:</strong> your email address and booking details, solely to send you receipts and account notifications.</p>
        <p><strong>Internal operations spreadsheet:</strong> a subset of booking details (name, contact, booking reference, service details) is also logged to an internal Google Sheet used for day-to-day operations and record-keeping by the Gerak team.</p>
        <p><strong>Assigned driver/rider:</strong> only the details needed to fulfil your booking (name, phone number, pickup/delivery details) are shared with the specific driver or rider assigned to it.</p>
        <p><strong>University administration:</strong> where a booking (e.g. Jubah) requires coordination with your university's own convocation logistics.</p>
        <p>We do <strong>not</strong> sell your personal data, and we do not share it with third parties for their own marketing purposes.</p>
      </Section>

      <Section title="5. IC/MyKad number handling">
        <p>
          Driver and rider accounts are verified by driving licence only — neither role is required to provide an
          IC number. Where an IC number is collected, it's for Jubah bookings specifically: customers provide it
          when placing a Jubah order, used as an ownership check at pickup/delivery. It is masked (only the first
          6 digits, i.e. your date of birth, are ever shown) everywhere it's displayed after initial submission,
          including in receipts, emails, and admin views. Full IC numbers are never included in email receipts.
        </p>
      </Section>

      <Section title="6. Local storage on your device">
        <p>
          The app stores a small amount of data directly on your device (browser local storage) — your login
          session, and in-progress Jubah booking form drafts, so you don't lose your input if you close the app
          partway through. This data stays on your device and is not a tracking cookie; it is not shared with any
          third party. Clearing your browser/app data will remove it.
        </p>
      </Section>

      <Section title="7. How long we keep your data">
        <p>
          We retain account and booking data for as long as your account is active and as needed to meet legal,
          accounting, and dispute-resolution obligations. Verification documents (licence images) are retained
          only as long as needed for your active driver/rider status. Monthly fee receipts for drivers/riders are
          kept for 3 months after being replaced by a newer one, for accounting and dispute-resolution purposes,
          then automatically removed. You can request deletion of your account and
          associated data at any time from Profile → Delete Account, or by contacting us directly — see Section 12.
        </p>
      </Section>

      <Section title="8. Your rights under PDPA">
        <p>You have the right to:</p>
        <p>• Request access to the personal data we hold about you.</p>
        <p>• Request correction of inaccurate or outdated data.</p>
        <p>• Withdraw consent to further processing, or request deletion of your account.</p>
        <p>To exercise any of these rights, contact us at gerakmygroup@gmail.com or use the in-app Delete Account option.</p>
      </Section>

      <Section title="9. Security">
        <p>
          Access to your data is restricted by role — for example, admins only see bookings from their own campus
          unless they hold a platform-wide (superadmin) role, and sensitive lookup endpoints are rate-limited to
          prevent abuse. No online service can guarantee absolute security, but we take reasonable technical and
          organisational measures to protect your data against unauthorised access, loss, or misuse.
        </p>
      </Section>

      <Section title="10. Children's privacy">
        <p>
          Gerak is intended for use by university students and staff and is not directed at children. We do not
          knowingly collect data from individuals under 18 outside of this context.
        </p>
      </Section>

      <Section title="11. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected by updating the "Last
          updated" date above. Continued use of Gerak after a change means you accept the updated policy.
        </p>
      </Section>

      <Section title="12. Contact us">
        <p>
          Questions about this policy or how your data is handled: gerakmygroup@gmail.com
        </p>
      </Section>

    </div>
  );
};
