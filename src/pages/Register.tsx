import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { ShieldAlert, User, Mail, Lock, Eye, EyeOff, Phone, ArrowRight, MapPin, IdCard, Car, X, Check, ChevronLeft, CheckCircle } from 'lucide-react';
import { NativeSelect } from '../components/NativeSelect';
import { TermsOfService } from './TermsOfService';
import { PrivacyPolicy } from './PrivacyPolicy';

type InviteStatus = null | 'checking' | { isDriver: boolean; campus: string; role: string };

// Small validation bubble that sits directly under the field it's about,
// flowing naturally in the page (not fixed/absolutely positioned via a
// calculated getBoundingClientRect) — that's deliberate: an earlier
// attempt used real `required` checkbox inputs to get the browser's own
// native validation bubble, but on a real device that bubble anchored to
// the input's actual (visually-hidden) position instead of the visible
// checkbox next to it, landing off-screen behind the phone's nav bar.
// Rendering this as a normal sibling in document flow, right after the
// field it belongs to, can't have that problem — it's always exactly
// where it visually needs to be, regardless of scroll position or how
// the underlying control is styled.
const FieldBubble: React.FC<{ message: string }> = ({ message }) => (
  <div className="relative mt-1.5 animate-fade-in">
    <div className="absolute -top-[7px] left-4 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45" />
    <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg">
      <span className="w-4 h-4 rounded bg-orange-500 text-white flex items-center justify-center shrink-0 text-[11px] font-black leading-none">!</span>
      <span className="text-xs font-semibold text-slate-700">{message}</span>
    </div>
  </div>
);

export const Register: React.FC = () => {
  const { register, setCurrentPage, setLeaveGuard } = useApp();
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  // Shown as an in-place overlay rather than a real page navigation
  // (setCurrentPage) — navigating away unmounts this whole form and loses
  // every field the user has typed so far. An overlay keeps Register.tsx
  // mounted the entire time, so nothing is lost when it closes.
  const [viewingPolicy, setViewingPolicy] = useState<'terms' | 'privacy' | null>(null);
  const [university, setUniversity] = useState('');
  const [campus,     setCampus]     = useState('');
  const [gerakId,    setGerakId]    = useState('');
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const formatPhone = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    return `${d.slice(0, 3)}-${d.slice(3)}`;
  };
  // Prefilled from the staff-invite email's ?email= link param, if present
  // (AppContext's /register deep link) — saves a retype and guarantees it
  // exactly matches the address the invite was actually sent to, which is
  // what check_driver_invite below keys off of.
  const [email,      setEmail]      = useState(() => new URLSearchParams(window.location.search).get('email') ?? '');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  // Reserved for the one message that deserves to stay on screen: a real
  // account-creation failure from the server, which the user needs time to
  // actually read and act on — separate from the per-field bubbles below,
  // which are about fixable input mistakes and clear themselves.
  const [error,    setError]    = useState('');
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>(null);

  // Derived helpers
  const invite = inviteStatus !== null && inviteStatus !== 'checking' ? inviteStatus : null;
  const isDriver = invite?.isDriver === true;
  const effectiveCampus = isDriver ? invite!.campus : campus;

  // Live invite check — debounced 600ms after email changes
  useEffect(() => {
    if (!email || !email.includes('@')) {
      queueMicrotask(() => setInviteStatus(null));
      return;
    }
    queueMicrotask(() => setInviteStatus('checking'));
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('check_driver_invite', { p_email: email });
      setInviteStatus({ isDriver: data?.is_driver ?? false, campus: data?.campus ?? '', role: data?.role ?? 'driver' });
    }, 600);
    return () => clearTimeout(timer);
  }, [email]);

  // Gerak ID preview
  useEffect(() => {
    if (!effectiveCampus) {
      queueMicrotask(() => setGerakId(''));
      return;
    }
    const rpc = invite?.role === 'rider'
      ? 'get_next_rider_gerak_id'
      : isDriver ? 'get_next_driver_gerak_id' : 'get_next_gerak_id';
    supabase.rpc(rpc, { p_campus: effectiveCampus })
      .then(({ data }) => setGerakId(data ?? ''));
  }, [effectiveCampus, isDriver, invite?.role]);

  // Without this, the phone's hardware/gesture back button isn't aware the
  // overlay is open at all — it goes straight to AppContext's normal
  // back-navigation (leaving Register entirely, taking the whole filled-in
  // form with it) instead of just closing the overlay. Registering a leave
  // guard while the overlay is open makes the back button close it first,
  // exactly like the in-overlay back arrow already does.
  useEffect(() => {
    if (!viewingPolicy) { setLeaveGuard(null); return; }
    setLeaveGuard(() => () => setViewingPolicy(null));
    return () => setLeaveGuard(null);
  }, [viewingPolicy, setLeaveGuard]);

  // Any edit anywhere dismisses whatever bubble is currently showing —
  // simplest reasonable "try again" signal, without wiring a clear call
  // into every individual field's onChange.
  useEffect(() => { setFieldError(null); }, [university, campus, name, phone, email, password, confirmPassword, agreedToTerms, agreedToPrivacy]);

  // Without this, a bubble for a field above the current scroll position
  // (e.g. University, right at the top) renders completely off-screen —
  // from the user's seat, tapping Register while scrolled down to
  // Password/the checkboxes looks like nothing happened at all, when
  // really a bubble appeared somewhere they can't see.
  useEffect(() => {
    if (!fieldError) return;
    document.querySelector(`[data-field="${fieldError.field}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [fieldError]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!university) { setFieldError({ field: 'university', message: 'Please select your university.' }); return; }
    if (!isDriver && !campus) { setFieldError({ field: 'campus', message: 'Please select your campus.' }); return; }
    if (!name.trim()) { setFieldError({ field: 'name', message: 'Please fill out this field.' }); return; }
    if (name.trim().length < 2) { setFieldError({ field: 'name', message: 'Full name must be at least 2 characters.' }); return; }
    if (!phone.trim()) { setFieldError({ field: 'phone', message: 'Please fill out this field.' }); return; }
    if (!/^\d{10,15}$/.test(phone.replace(/[\s\-+]/g, ''))) {
      setFieldError({ field: 'phone', message: 'Please enter a valid phone number.' }); return;
    }
    if (!email.trim()) { setFieldError({ field: 'email', message: 'Please fill out this field.' }); return; }
    if (!password) { setFieldError({ field: 'password', message: 'Please fill out this field.' }); return; }
    if (password.length < 6) { setFieldError({ field: 'password', message: 'Password must be at least 6 characters.' }); return; }
    if (!confirmPassword) { setFieldError({ field: 'confirmPassword', message: 'Please fill out this field.' }); return; }
    if (password !== confirmPassword) { setFieldError({ field: 'confirmPassword', message: 'Passwords do not match.' }); return; }
    if (!agreedToTerms) { setFieldError({ field: 'terms', message: 'Please tick this box if you want to proceed.' }); return; }
    if (!agreedToPrivacy) { setFieldError({ field: 'privacy', message: 'Please tick this box if you want to proceed.' }); return; }

    setFieldError(null);
    setLoading(true);
    setError('');
    const { error: authError, needsConfirmation: pendingConfirmation } = await register(name, '', email, password, phone, university, effectiveCampus, agreedToTerms && agreedToPrivacy);
    setLoading(false);
    if (pendingConfirmation) {
      setNeedsConfirmation(true);
      return;
    }
    if (authError) {
      // Supabase's own duplicate-email message ("User already registered")
      // — surfaced as its own bubble under Email, same as every other
      // fixable mistake on this form, rather than the generic banner below
      // (which is for errors that aren't about a specific field).
      if (authError.toLowerCase().includes('already registered')) {
        setFieldError({ field: 'email', message: 'This email is already registered. Try signing in instead.' });
      } else {
        setError(authError);
      }
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col p-6 gap-4 select-none animate-fade-in h-full overflow-hidden touch-pan-y"
      style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>

      {/* Close button */}
      <div className="pt-0">
        <button
          onClick={() => setCurrentPage('dashboard')}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center text-center mt-0">
        <div
          className="w-12 h-12 rounded-xl bg-white border border-slate-100 mb-2 flex items-center justify-center"
        >
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight font-heading m-0">
          Create Gerak Account
        </h2>
        <p className="text-slate-400 text-xs mt-1 font-normal">
          Register with unified campus login parameters.
        </p>
      </div>

      {/* Form Card — flex-1 so it fills remaining space, fields scroll, button fixed */}
      <div className="flex-1 w-full bg-white rounded-3xl border border-slate-100 flex flex-col overflow-hidden min-h-0">
      {needsConfirmation ? (
        // Email confirmation is required project-wide — the account was
        // genuinely created, but isn't usable until this link is clicked.
        // Same "check your inbox" pattern as ForgotPassword.tsx's success
        // state, not the red error banner: this isn't a failure, it's the
        // expected next step.
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-slate-800">Almost done — confirm your email</p>
          <p className="text-xs text-slate-400 font-normal leading-relaxed max-w-xs">
            We sent a confirmation link to <span className="text-slate-700 font-semibold">{email}</span>.
            Open it on this device and tap the link — you'll be signed in automatically.
          </p>
          <button
            onClick={() => setCurrentPage('login')}
            className="mt-2 bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition"
          >
            Sign In Manually Instead
          </button>
        </div>
      ) : (
      <>
        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-5 pt-5 pb-2 overscroll-contain touch-pan-y w-full">
        {/* noValidate — all validation is the custom FieldBubble system
            above, so native browser bubbles (which don't fire for
            NativeSelect/the checkboxes anyway, since neither is a real
            form control) never show for the fields that DO support them,
            keeping the experience consistent across every field. */}
        <form id="register-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 w-full">

          {/* University */}
          <div className="flex flex-col gap-1" data-field="university">
            <label className="text-xs font-semibold text-slate-400 pl-1">University</label>
            <NativeSelect
              value={university}
              onChange={u => { setUniversity(u); setCampus(''); }}
              options={[{ value: 'Universiti Malaysia Pahang Al-Sultan Abdullah', label: 'Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)' }]}
              placeholder="Select your university…"
              label="Select University"
            />
            {fieldError?.field === 'university' && <FieldBubble message={fieldError.message} />}
          </div>

          {/* Campus — auto-locked for drivers, selectable for customers */}
          {university && (
            isDriver ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-400 pl-1">Campus</label>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl py-2 px-3">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700 flex-1">UMPSA {invite!.campus}</span>
                  <span className="text-[8px] font-normal text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded-full">Auto-assigned</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1" data-field="campus">
                <label className="text-xs font-semibold text-slate-400 pl-1">Campus</label>
                <NativeSelect
                  value={campus}
                  onChange={setCampus}
                  options={[{ value: 'Gambang', label: 'Gambang' }, { value: 'Pekan', label: 'Pekan' }]}
                  placeholder="Select your campus…"
                  label="Select Campus"
                />
                {fieldError?.field === 'campus' && <FieldBubble message={fieldError.message} />}
              </div>
            )
          )}

          {/* Gerak ID preview */}
          {gerakId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400 pl-1">Your Gerak ID</label>
              <div className="relative">
                <IdCard className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                <input
                  type="text"
                  value={gerakId}
                  readOnly
                  className="w-full bg-emerald-50 border border-emerald-200 rounded-xl py-2 pl-9 pr-3 text-xs font-black text-emerald-700 cursor-default select-none focus:outline-none"
                />
              </div>
              <p className="text-xs text-slate-400 font-normal pl-1">Auto-assigned — cannot be changed</p>
            </div>
          )}

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

          {/* Email */}
          <div className="flex flex-col gap-1" data-field="email">
            <label className="text-xs font-semibold text-slate-400 pl-1">Email Address</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="smartcampus@gmail.com"
              />
            </div>
            {fieldError?.field === 'email' && <FieldBubble message={fieldError.message} />}

            {/* Account type indicator */}
            {inviteStatus !== null && (
              <div className={`mt-1.5 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-normal transition-all ${
                inviteStatus === 'checking'
                  ? 'bg-slate-50 border-slate-200 text-slate-400'
                  : isDriver
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                {inviteStatus === 'checking' ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin shrink-0" />
                    <span>Checking account type…</span>
                  </>
                ) : isDriver ? (
                  <>
                    <Car className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight">
                        {invite!.role === 'admin' ? 'Pre-approved Admin' : invite!.role === 'rider' ? 'Pre-approved Rider' : 'Pre-approved Driver'}
                      </p>
                      <p className="text-xs font-normal opacity-70 mt-0.5">
                        UMPSA {invite!.campus} · {invite!.role === 'admin' ? 'Admin Account' : invite!.role === 'rider' ? 'Rider Account' : 'Driver Account'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight">Standard Account</p>
                      <p className="text-xs font-normal opacity-70 mt-0.5">Customer · {campus ? `UMPSA ${campus}` : 'Select campus above'}</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1" data-field="password">
            <label className="text-xs font-semibold text-slate-400 pl-1">Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-9 pr-9 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="At least 6 characters"
              />
              <button type="button" onPointerDown={e => { e.preventDefault(); setShowPassword(v => !v); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-transform">
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {fieldError?.field === 'password' && <FieldBubble message={fieldError.message} />}
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1" data-field="confirmPassword">
            <label className="text-xs font-semibold text-slate-400 pl-1">Confirm Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-9 pr-9 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="Re-enter password"
              />
              <button type="button" onPointerDown={e => { e.preventDefault(); setShowConfirm(v => !v); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-transform">
                {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {fieldError?.field === 'confirmPassword' && <FieldBubble message={fieldError.message} />}
          </div>

          {/* Terms & Privacy consent — two separate ticks, each with its own
              independent bubble right underneath it. Plain styled divs, not
              real checkbox inputs — tried native `required` inputs so an
              unticked box would trigger the browser's own validation bubble,
              but on a real device that bubble anchored to the hidden input's
              actual position instead of the visible checkbox, landing
              off-screen behind the nav bar. Each row is a div (not a
              button) since the inline link inside it needs to be its own
              tappable control (a <button> can't nest other interactive
              elements). */}
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

        {/* Fixed submit button at bottom of card */}
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 shrink-0">
          <button
            type="submit"
            form="register-form"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover active:scale-[0.99] disabled:bg-slate-200 text-white font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <><span>Register Account</span><ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </>
      )}
      </div>

      {/* Footer — fixed outside card */}
      <div className="text-center shrink-0">
        <span className="text-xs text-slate-400 font-semibold">Already registered? </span>
        <button onClick={() => setCurrentPage('login')}
          className="text-xs text-primary font-semibold hover:underline active:scale-95 transition">
          Sign In Here
        </button>
      </div>

      {/* Terms / Privacy overlay — renders the real page content in place,
          without navigating away from (and unmounting) this form */}
      {viewingPolicy && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
          <div className="flex items-center gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-slate-100 shrink-0">
            <button
              onClick={() => setViewingPolicy(null)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700">Back to Registration</span>
          </div>
          {viewingPolicy === 'terms' ? <TermsOfService /> : <PrivacyPolicy />}
        </div>
      )}
    </div>
  );
};
