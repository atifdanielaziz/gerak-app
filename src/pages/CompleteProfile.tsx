import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, User, Phone, ArrowRight, Check, ChevronLeft, LogOut } from 'lucide-react';
import { NativeSelect } from '../components/NativeSelect';
import { TermsOfService } from './TermsOfService';
import { PrivacyPolicy } from './PrivacyPolicy';
import { UNIVERSITIES } from '../lib/universities';

// Shown after a brand-new Google/Apple sign-up — those never supply phone
// number, university, or campus (fields Gerak requires), so
// AppContext.tsx's loadProfile() routes here instead of the user's normal
// home until this runs. Deliberately no close/X button and no "skip" —
// same forced-page pattern as ResetPassword.tsx (pageHistory reset to [],
// nothing to back out to). An invited driver/rider/admin who signed up
// fresh via OAuth instead of Register.tsx's form can also land here, but
// only for their missing phone — university/campus already arrived
// correctly from their invite, so that picker only renders when actually
// blank.
const FieldBubble: React.FC<{ message: string }> = ({ message }) => (
  <div className="relative mt-1.5 animate-fade-in">
    <div className="absolute -top-[7px] left-4 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45" />
    <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg">
      <span className="w-4 h-4 rounded bg-orange-500 text-white flex items-center justify-center shrink-0 text-[11px] font-black leading-none">!</span>
      <span className="text-xs font-semibold text-slate-700">{message}</span>
    </div>
  </div>
);

export const CompleteProfile: React.FC = () => {
  const { user, completeOAuthProfile, logout, setLeaveGuard } = useApp();
  const needsUniversity = !user.university || !user.campus;

  const [name, setName] = useState(user.name && user.name !== 'Student' ? user.name : '');
  const [phone, setPhone] = useState('');
  const [university, setUniversity] = useState('');
  const [campus, setCampus] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState<'terms' | 'privacy' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  const formatPhone = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    return `${d.slice(0, 3)}-${d.slice(3)}`;
  };

  const selectedUni = UNIVERSITIES.find(u => u.fullName === university);

  // Same reason as Register.tsx's identical effect — without this, the
  // back button/gesture leaves the Terms/Privacy overlay unaware it's
  // open and goes straight to AppContext's normal back-navigation.
  useEffect(() => {
    if (!viewingPolicy) { setLeaveGuard(null); return; }
    setLeaveGuard(() => () => setViewingPolicy(null));
    return () => setLeaveGuard(null);
  }, [viewingPolicy, setLeaveGuard]);

  useEffect(() => { setFieldError(null); }, [name, phone, university, campus, agreedToTerms, agreedToPrivacy]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFieldError({ field: 'name', message: 'Please fill out this field.' }); return; }
    if (name.trim().length < 2) { setFieldError({ field: 'name', message: 'Full name must be at least 2 characters.' }); return; }
    if (!phone.trim()) { setFieldError({ field: 'phone', message: 'Please fill out this field.' }); return; }
    if (!/^\d{10,15}$/.test(phone.replace(/[\s\-+]/g, ''))) {
      setFieldError({ field: 'phone', message: 'Please enter a valid phone number.' }); return;
    }
    if (needsUniversity) {
      if (!university) { setFieldError({ field: 'university', message: 'Please select your university.' }); return; }
      if (!campus) { setFieldError({ field: 'campus', message: 'Please select your campus.' }); return; }
    }
    if (!agreedToTerms) { setFieldError({ field: 'terms', message: 'Please tick this box if you want to proceed.' }); return; }
    if (!agreedToPrivacy) { setFieldError({ field: 'privacy', message: 'Please tick this box if you want to proceed.' }); return; }

    setFieldError(null);
    setLoading(true);
    setError('');
    const { error: submitError } = await completeOAuthProfile({
      name, phone, university, campus, agreedToTerms, agreedToPrivacy,
    });
    setLoading(false);
    if (submitError) setError(submitError);
  };

  return (
    <div className="flex-1 bg-white flex flex-col p-6 gap-4 select-none animate-fade-in h-full overflow-hidden touch-pan-y"
      style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>

      {/* Header — no close button, this page can't be skipped */}
      <div className="flex flex-col items-center text-center mt-4">
        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 mb-2 flex items-center justify-center">
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight font-heading m-0">
          Finish Your Profile
        </h2>
        <p className="text-slate-400 text-xs mt-1 font-normal">
          A few more details before you can start using Gerak.
        </p>
      </div>

      <div className="flex-1 w-full bg-white rounded-3xl border border-slate-100 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-5 pt-5 pb-2 overscroll-contain touch-pan-y w-full">
          <form id="complete-profile-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 w-full">

            {/* Full Name */}
            <div className="flex flex-col gap-1" data-field="name">
              <label className="text-xs font-semibold text-slate-400 pl-1">Full Name</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))}
                  className="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                  placeholder="Full name"
                />
              </div>
              {fieldError?.field === 'name' && <FieldBubble message={fieldError.message} />}
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1" data-field="phone">
              <label className="text-xs font-semibold text-slate-400 pl-1">Phone Number</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(formatPhone(e.target.value))}
                  className="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                  placeholder="e.g. 012-34567890"
                />
              </div>
              {fieldError?.field === 'phone' && <FieldBubble message={fieldError.message} />}
            </div>

            {/* University + Campus — only for a fresh sign-up with no
                invite, i.e. university/campus are actually blank. An
                invited driver/rider/admin already has these correct. */}
            {needsUniversity && (
              <>
                <div className="flex flex-col gap-1" data-field="university">
                  <label className="text-xs font-semibold text-slate-400 pl-1">University</label>
                  <NativeSelect
                    value={university}
                    onChange={u => {
                      setUniversity(u);
                      const uni = UNIVERSITIES.find(x => x.fullName === u);
                      setCampus(uni && uni.campuses.length === 1 ? uni.campuses[0] : '');
                    }}
                    options={UNIVERSITIES.map(u => ({ value: u.fullName, label: u.label }))}
                    placeholder="Select your university…"
                    label="Select University"
                  />
                  {fieldError?.field === 'university' && <FieldBubble message={fieldError.message} />}
                </div>

                {selectedUni && selectedUni.campuses.length > 1 && (
                  <div className="flex flex-col gap-1" data-field="campus">
                    <label className="text-xs font-semibold text-slate-400 pl-1">Campus</label>
                    <NativeSelect
                      value={campus}
                      onChange={setCampus}
                      options={selectedUni.campuses.map(c => ({ value: c, label: c }))}
                      placeholder="Select your campus…"
                      label="Select Campus"
                    />
                    {fieldError?.field === 'campus' && <FieldBubble message={fieldError.message} />}
                  </div>
                )}
              </>
            )}

            {/* Terms & Privacy consent — same pattern as Register.tsx */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1" data-field="terms">
                <div
                  onPointerDown={e => { e.preventDefault(); setAgreedToTerms(v => !v); }}
                  className={`flex items-start gap-2.5 border rounded-xl py-2.5 px-3 transition-transform active:scale-[0.99] cursor-pointer ${
                    agreedToTerms ? 'border-slate-900 bg-white' : 'border-slate-100 bg-white'
                  }`}
                >
                  <span className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                    agreedToTerms ? 'bg-primary border-primary' : 'border-slate-300'
                  }`}>
                    {agreedToTerms && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-xs text-slate-500 font-normal leading-relaxed">
                    I agree to Gerak's{' '}
                    <button
                      type="button"
                      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); setViewingPolicy('terms'); }}
                      className="text-primary font-semibold hover:underline"
                    >
                      Terms &amp; Conditions
                    </button>
                    .
                  </span>
                </div>
                {fieldError?.field === 'terms' && <FieldBubble message={fieldError.message} />}
              </div>

              <div className="flex flex-col gap-1" data-field="privacy">
                <div
                  onPointerDown={e => { e.preventDefault(); setAgreedToPrivacy(v => !v); }}
                  className={`flex items-start gap-2.5 border rounded-xl py-2.5 px-3 transition-transform active:scale-[0.99] cursor-pointer ${
                    agreedToPrivacy ? 'border-slate-900 bg-white' : 'border-slate-100 bg-white'
                  }`}
                >
                  <span className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                    agreedToPrivacy ? 'bg-primary border-primary' : 'border-slate-300'
                  }`}>
                    {agreedToPrivacy && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-xs text-slate-500 font-normal leading-relaxed">
                    I agree to Gerak's{' '}
                    <button
                      type="button"
                      onPointerDown={e => { e.stopPropagation(); e.preventDefault(); setViewingPolicy('privacy'); }}
                      className="text-primary font-semibold hover:underline"
                    >
                      Privacy Policy
                    </button>
                    .
                  </span>
                </div>
                {fieldError?.field === 'privacy' && <FieldBubble message={fieldError.message} />}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-2.5 text-xs text-danger font-semibold text-center flex items-center justify-center gap-1.5 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                {error}
              </div>
            )}
          </form>
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-slate-100 shrink-0">
          <button
            type="submit"
            form="complete-profile-form"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover active:scale-[0.99] disabled:bg-slate-200 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <><span>Continue</span><ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </div>

      {/* Not this account? Sign out and try a different one — doesn't let
          anyone bypass completing the form to reach the app, it just goes
          back to Login. */}
      <div className="text-center shrink-0">
        <button onClick={logout}
          className="text-xs text-slate-400 font-semibold hover:underline active:scale-95 transition inline-flex items-center gap-1">
          <LogOut className="w-3 h-3" /> Not you? Sign out
        </button>
      </div>

      {viewingPolicy && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
          <div className="flex items-center gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-slate-100 shrink-0">
            <button
              onClick={() => setViewingPolicy(null)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700">Back</span>
          </div>
          {viewingPolicy === 'terms' ? <TermsOfService /> : <PrivacyPolicy />}
        </div>
      )}
    </div>
  );
};
