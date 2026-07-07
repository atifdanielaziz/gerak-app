import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { ShieldAlert, User, Mail, Lock, Eye, EyeOff, Phone, ArrowRight, Building2, MapPin, IdCard, Car } from 'lucide-react';

type InviteStatus = null | 'checking' | { isDriver: boolean; campus: string; role: string };

export const Register: React.FC = () => {
  const { register, setCurrentPage } = useApp();
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
  const [email,      setEmail]      = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>(null);

  // Derived helpers
  const invite = inviteStatus !== null && inviteStatus !== 'checking' ? inviteStatus : null;
  const isDriver = invite?.isDriver === true;
  const effectiveCampus = isDriver ? invite!.campus : campus;

  // Live invite check — debounced 600ms after email changes
  useEffect(() => {
    if (!email || !email.includes('@')) { setInviteStatus(null); return; }
    setInviteStatus('checking');
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('check_driver_invite', { p_email: email });
      setInviteStatus({ isDriver: data?.is_driver ?? false, campus: data?.campus ?? '', role: data?.role ?? 'driver' });
    }, 600);
    return () => clearTimeout(timer);
  }, [email]);

  // Gerak ID preview
  useEffect(() => {
    if (!effectiveCampus) { setGerakId(''); return; }
    const rpc = invite?.role === 'rider'
      ? 'get_next_rider_gerak_id'
      : isDriver ? 'get_next_driver_gerak_id' : 'get_next_gerak_id';
    supabase.rpc(rpc, { p_campus: effectiveCampus })
      .then(({ data }) => setGerakId(data ?? ''));
  }, [effectiveCampus, isDriver, invite?.role]);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!university) { setError('Please select your university.'); return; }
    if (!isDriver && !campus) { setError('Please select your campus.'); return; }
    if (!name || !phone || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.'); return;
    }
    if (name.trim().length < 2) { setError('Full name must be at least 2 characters.'); return; }
    if (!/^\d{10,15}$/.test(phone.replace(/[\s\-+]/g, ''))) {
      setError('Please enter a valid phone number.'); return;
    }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    setError('');
    const { error: authError } = await register(name, '', email, password, phone, university, effectiveCampus);
    setLoading(false);
    if (authError) setError(authError);
  };

  return (
    <div className="flex-1 bg-slate-50 flex flex-col p-6 gap-4 select-none animate-fade-in h-full overflow-hidden touch-pan-y">

      {/* Header */}
      <div className="flex flex-col items-center text-center mt-4">
        <div
          className="w-12 h-12 rounded-xl bg-white shadow-lg shadow-primary/10 mb-2 flex items-center justify-center"
        >
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
        </div>
        <h2 className="text-xl font-black text-slate-800 tracking-tight font-heading m-0">
          Create Gerak Account
        </h2>
        <p className="text-slate-400 text-xs mt-1 font-bold">
          Register with unified campus login parameters.
        </p>
      </div>

      {/* Form Card — flex-1 so it fills remaining space, fields scroll, button fixed */}
      <div className="flex-1 w-full bg-white rounded-3xl border border-slate-100 shadow-md flex flex-col overflow-hidden min-h-0">

        {/* Scrollable fields */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-5 pt-5 pb-2 overscroll-contain touch-pan-y w-full">
        <form id="register-form" onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">

          {/* University */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">University</label>
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={university}
                onChange={e => { setUniversity(e.target.value); setCampus(''); }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition appearance-none"
                required
              >
                <option value="" disabled>Select your university…</option>
                <option value="Universiti Malaysia Pahang Al-Sultan Abdullah">Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)</option>
              </select>
            </div>
          </div>

          {/* Campus — auto-locked for drivers, selectable for customers */}
          {university && (
            isDriver ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Campus</label>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl py-2 px-3">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs font-extrabold text-emerald-700 flex-1">UMPSA {invite!.campus}</span>
                  <span className="text-[8px] font-bold text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded-full">Auto-assigned</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Campus</label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={campus}
                    onChange={e => setCampus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition appearance-none"
                    required
                  >
                    <option value="" disabled>Select your campus…</option>
                    <option value="Gambang">Gambang</option>
                    <option value="Pekan">Pekan</option>
                  </select>
                </div>
              </div>
            )
          )}

          {/* Gerak ID preview */}
          {gerakId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Your Gerak ID</label>
              <div className="relative">
                <IdCard className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                <input
                  type="text"
                  value={gerakId}
                  readOnly
                  className="w-full bg-emerald-50 border border-emerald-200 rounded-xl py-2 pl-9 pr-3 text-xs font-black text-emerald-700 cursor-default select-none focus:outline-none"
                />
              </div>
              <p className="text-xs text-slate-400 font-semibold pl-1">Auto-assigned — cannot be changed</p>
            </div>
          )}

          {/* Full Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Full Name</label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="Full name"
                required
              />
            </div>
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Phone Number</label>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="e.g. 012-34567890"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Email Address</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="smartcampus@gmail.com"
                required
              />
            </div>

            {/* Account type indicator */}
            {inviteStatus !== null && (
              <div className={`mt-1.5 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all ${
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
                      <p className="font-extrabold leading-tight">
                        {invite!.role === 'admin' ? 'Pre-approved Admin' : invite!.role === 'rider' ? 'Pre-approved Rider' : 'Pre-approved Driver'}
                      </p>
                      <p className="text-xs font-semibold opacity-70 mt-0.5">
                        UMPSA {invite!.campus} · {invite!.role === 'admin' ? 'Admin Account' : invite!.role === 'rider' ? 'Rider Account' : 'Driver Account'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <User className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-extrabold leading-tight">Standard Account</p>
                      <p className="text-xs font-semibold opacity-70 mt-0.5">Customer · {campus ? `UMPSA ${campus}` : 'Select campus above'}</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-9 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="At least 6 characters"
                required
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Confirm Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-9 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="Re-enter password"
                required
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-2.5 text-xs text-danger font-bold text-center flex items-center justify-center gap-1.5 animate-pulse">
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
            className="w-full bg-primary hover:bg-primary-hover active:scale-[0.99] disabled:bg-slate-200 text-white font-extrabold py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-2"
          >
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <><span>Register Account</span><ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      </div>

      {/* Footer — fixed outside card */}
      <div className="text-center shrink-0">
        <span className="text-xs text-slate-400 font-semibold">Already registered? </span>
        <button onClick={() => setCurrentPage('login')}
          className="text-xs text-primary font-bold hover:underline active:scale-95 transition">
          Sign In Here
        </button>
      </div>
    </div>
  );
};
