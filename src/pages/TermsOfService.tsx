import React from 'react';
import { FileText } from 'lucide-react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-2">
    <h3 className="text-sm font-bold text-slate-800 m-0">{title}</h3>
    <div className="text-xs text-slate-500 leading-relaxed font-normal flex flex-col gap-2">
      {children}
    </div>
  </div>
);

export const TermsOfService: React.FC = () => {
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      {/* Page Header */}
      <div className="mt-4 flex items-center gap-2 pl-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 m-0">Terms &amp; Conditions</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">Last updated: 29 July 2026</p>
        </div>
      </div>

      <Section title="1. Acceptance of these terms">
        <p>
          By creating an account or using any part of Gerak (Transport, Jubah, or Rental), you agree to these
          Terms &amp; Conditions and our Privacy Policy. If you don't agree, please don't use the platform.
        </p>
        <p>
          You confirm this agreement by ticking the consent checkbox on the sign-up form, and the date/time of
          that confirmation is recorded against your account.
        </p>
      </Section>

      <Section title="2. What Gerak is">
        <p>
          Gerak is a campus community platform for students and staff at the universities we serve — currently
          Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA), with more campuses planned. It connects you with
          fellow students and staff acting as drivers, Jubah delivery riders, and vehicle owners. Gerak facilitates
          these connections
          and processes payment on behalf of service providers — it is <strong>not</strong> a licensed public
          transport operator, courier company, or car rental company in its own right, and services are provided
          on a best-effort, peer-community basis, not a guaranteed commercial service.
        </p>
        <p>
          Gerak is currently built and operated by its founding team as an independent project, not yet a
          registered company.
        </p>
      </Section>

      <Section title="3. Eligibility">
        <p>
          Gerak is intended for current students and staff of the universities we serve. By registering, you confirm that the matric
          number and other details you provide are accurate and belong to you. Providing false information may
          result in account suspension.
        </p>
        <p>
          Drivers and Jubah riders must additionally pass document verification (driving licence review) before
          being able to accept jobs. This is separate from the IC number Jubah booking customers provide when
          placing an order, which is used only as an ownership check for that booking (see our Privacy Policy,
          Section 5).
        </p>
      </Section>

      <Section title="4. Your account">
        <p>
          You're responsible for keeping your login credentials secure and for all activity under your account.
          Let us know immediately if you believe your account has been accessed without your permission.
        </p>
      </Section>

      <Section title="5. Payments">
        <p>
          Payments are processed through our third-party payment gateway (ToyyibPay). Prices shown at the time of
          booking are the amount charged; Gerak does not add hidden fees on top of what's displayed.
        </p>
        <p>
          <strong>Jubah deposits are non-refundable once paid.</strong> This is disclosed clearly at the point of
          booking before you pay. The remaining balance (where applicable) is only charged when you choose to pay
          it, and is refundable if your booking is cancelled before that payment is made.
        </p>
        <p>
          If a payment succeeds on the payment gateway's side but doesn't reflect in the app (e.g. due to a
          connectivity issue), contact us with your reference number — this is a known, monitored edge case and we
          reconcile it manually.
        </p>
      </Section>

      <Section title="6. Cancellations">
        <p>
          Ride bookings can be cancelled within a short window after a driver accepts (shown in-app at the time);
          after that window, cancellation may not be available through the app and you should contact the driver
          or Gerak support directly.
        </p>
        <p>
          Jubah bookings can be cancelled free of charge before the deposit/payment is made. Once paid, the
          non-refundable deposit rule in Section 5 applies.
        </p>
        <p>
          Rental bookings follow the cancellation terms shown at the time of booking, which may vary by vehicle
          owner.
        </p>
      </Section>

      <Section title="7. Driver, rider &amp; vehicle-owner responsibilities">
        <p>
          If you act as a driver, Jubah rider, or vehicle owner on Gerak, you agree to provide accurate
          documentation, keep your availability status up to date, handle deliveries and passengers responsibly,
          and comply with all applicable Malaysian traffic and safety laws. Gerak may suspend or terminate your
          ability to accept jobs if you violate these terms or repeatedly receive verified complaints.
        </p>
      </Section>

      <Section title="8. Prohibited conduct">
        <p>You agree not to:</p>
        <p>• Provide false identity, academic, or vehicle information.</p>
        <p>• Use the platform for any unlawful purpose, or to harass, threaten, or endanger another user.</p>
        <p>• Attempt to circumvent payment, verification, or campus-eligibility checks.</p>
        <p>• Interfere with or attempt to disrupt the platform's normal operation.</p>
      </Section>

      <Section title="9. Service availability">
        <p>
          Gerak depends on the availability of student/staff drivers, riders, and vehicle owners, and on
          third-party services (payment gateway, hosting, email delivery) we don't control. We don't guarantee
          uninterrupted availability and aren't liable for delays or unavailability caused by factors outside our
          reasonable control.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the maximum extent permitted by Malaysian law, Gerak and its operating team are not liable for
          indirect, incidental, or consequential damages arising from your use of the platform, or from the
          conduct of individual drivers, riders, or vehicle owners, who act as independent members of the campus
          community rather than as Gerak's employees or agents. This does not limit any liability that cannot be
          excluded under Malaysian law.
        </p>
      </Section>

      <Section title="11. Account suspension &amp; termination">
        <p>
          We may suspend or terminate accounts that violate these terms, provide fraudulent information, or pose a
          safety risk to other users. You may stop using Gerak and request account deletion at any time — see our
          Privacy Policy for how.
        </p>
      </Section>

      <Section title="12. Intellectual property">
        <p>
          The Gerak name, logo, and app design are the property of the Gerak team. You may not copy, reproduce, or
          use them without permission.
        </p>
      </Section>

      <Section title="13. Governing law">
        <p>
          These terms are governed by the laws of Malaysia, and any disputes will be subject to the exclusive
          jurisdiction of the Malaysian courts.
        </p>
      </Section>

      <Section title="14. Changes to these terms">
        <p>
          We may update these terms from time to time. Material changes will be reflected by updating the "Last
          updated" date above. Continued use of Gerak after a change means you accept the updated terms.
        </p>
      </Section>

      <Section title="15. Contact us">
        <p>
          Questions about these terms: ayamhutanrider@gmail.com
        </p>
      </Section>

    </div>
  );
};
