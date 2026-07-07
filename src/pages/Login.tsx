import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { consumeSessionExpiredMessage } from '../lib/idleSession';
import { Mail, Lock, Eye, EyeOff, ArrowRight, GraduationCap, PackageSearch } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, setCurrentPage } = useApp();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [jubahActive, setJubahActive] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'jubah_active').single()
      .then(({ data }) => { if (data) setJubahActive(data.value === 'true'); });
  }, []);

  // Reading (and clearing) sessionStorage is a side effect, so it must run in
  // an effect rather than a useState lazy initializer — React StrictMode
  // double-invokes lazy initializers in dev, which would consume the flag on
  // the first call and silently return '' on the second, dropping the banner.
  useEffect(() => {
    if (consumeSessionExpiredMessage()) {
      setError('Your session expired due to inactivity. Please log in again.');
    }
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await login(email.trim(), password);
    setLoading(false);
    if (authError) setError(authError);
  };

  return (
    <div className="flex-1 bg-slate-50 flex flex-col justify-between p-6 select-none animate-fade-in h-full">
      {/* Branding */}
      <div className="flex flex-col items-center text-center mt-6">
        <div
          className="w-14 h-14 rounded-2xl bg-white shadow-lg shadow-primary/10 mb-3 animate-float flex items-center justify-center"
        >
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2.4rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
        </div>
        <h2 className="text-2xl font-normal text-slate-800 tracking-tight font-heading m-0">
          Sign In to <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', lineHeight: 1, fontWeight: 700 }}>ger<span style={{ color: '#EF4444' }}>a</span>k</span>
        </h2>
        <p className="text-slate-400 text-xs mt-1 font-semibold">
          Smart University Service Platform
        </p>
      </div>

      {/* Form */}
      <div className="w-full bg-white rounded-3xl p-6 border border-slate-100 shadow-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="text"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:border-primary focus:bg-white transition"
                placeholder="smartcampus@gmail.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-10 text-sm text-slate-700 focus:outline-none focus:border-primary focus:bg-white transition"
                placeholder="••••••••"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="current-password"
                spellCheck={false}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-xs text-danger font-bold text-center">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover active:scale-[0.99] disabled:bg-slate-200 disabled:active:scale-100 text-white font-extrabold py-3.5 rounded-xl shadow-lg shadow-primary/20 transition flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <span className="w-5 h-5 rounded-full border-3 border-white border-t-transparent animate-spin" />
            ) : (
              <>
                Sign In
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Guest access — Jubah Delivery */}
      {jubahActive && (
        <div className="w-full flex flex-col gap-2 -mt-2">
          <button
            onClick={() => setCurrentPage('jubah')}
            className="w-full flex items-center justify-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 font-extrabold text-xs py-3 rounded-2xl active:scale-[0.98] transition"
          >
            <GraduationCap className="w-4 h-4" /> Book Jubah Delivery as Guest
          </button>
          <button
            onClick={() => setCurrentPage('track-jubah')}
            className="w-full flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 text-slate-500 font-extrabold text-xs py-3 rounded-2xl active:scale-[0.98] transition"
          >
            <PackageSearch className="w-4 h-4" /> Track My Jubah Order
          </button>
        </div>
      )}

      {/* Footer links */}
      <div className="flex flex-col items-center gap-2 mb-4">
        <button
          onClick={() => setCurrentPage('forgot-password')}
          className="text-xs text-slate-400 font-semibold hover:text-primary active:scale-95 transition"
        >
          Forgot password?
        </button>
        <div>
          <span className="text-xs text-slate-400 font-semibold">New student on campus? </span>
          <button
            onClick={() => setCurrentPage('register')}
            className="text-xs text-primary font-bold hover:underline active:scale-95 transition"
          >
            Create Gerak Account
          </button>
        </div>
      </div>
    </div>
  );
};
