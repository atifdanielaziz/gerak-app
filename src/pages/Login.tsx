import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { consumeSessionExpiredMessage } from '../lib/idleSession';
import { Mail, Lock, Eye, EyeOff, ArrowRight, X } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, setCurrentPage } = useApp();
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

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
    <div className="flex-1 bg-white flex flex-col overflow-y-auto no-scrollbar select-none animate-fade-in"
      style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

      {/* Back / close */}
      <div className="px-5 pt-4">
        <button
          onClick={() => setCurrentPage('dashboard')}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Branding */}
      <div className="flex flex-col items-center text-center mt-6 mb-8 px-6">
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: '2.5rem', color: '#0F172A', lineHeight: 1 }}>
          ger<span style={{ color: '#EF4444' }}>a</span>k
        </p>
        <p className="text-slate-400 text-xs mt-2 font-normal">Smart In-Campus Service Platform</p>
      </div>

      {/* Form */}
      <div className="px-6 flex flex-col gap-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 pl-1">Email Address</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="text"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value.trim())}
                className="w-full bg-white border border-slate-100 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="smartcampus@gmail.com"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                spellCheck={false}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 pl-1">Password</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-xl py-3 pl-10 pr-10 text-sm text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="••••••••"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="current-password"
                spellCheck={false}
                required
              />
              <button
                type="button"
                onPointerDown={e => { e.preventDefault(); setShowPassword(v => !v); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 active:scale-90 transition-transform"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember me + Forgot */}
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
              <span className="text-xs font-normal text-slate-500">Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => setCurrentPage('forgot-password')}
              className="text-xs font-semibold text-slate-400 hover:text-primary active:scale-95 transition"
            >
              Forgot Password?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-xs text-danger font-semibold text-center">
              {error}
            </div>
          )}

          {/* Sign In */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover active:scale-[0.99] disabled:bg-slate-200 disabled:active:scale-100 text-white font-semibold py-4 rounded-2xl transition flex items-center justify-center gap-2 mt-1"
          >
            {loading ? (
              <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <>Sign In <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {/* Or continue with */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-xs font-normal text-slate-400">Or continue with</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {/* Social buttons — visual only, not yet wired */}
        <div className="flex gap-3">
          <button
            type="button"
            disabled
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
          >
            {/* Apple icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.32.07 2.24.74 3.01.8.94-.19 1.84-.88 3.01-.95 1.29-.08 2.35.49 3.13 1.31-2.77 1.67-2.31 5.48.43 6.68-.63 1.64-1.51 3.26-2.58 5.04zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Apple
          </button>
          <button
            type="button"
            disabled
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
          >
            {/* Google icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
        </div>

        {/* Register link */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <p className="text-xs font-normal text-slate-400">
            New student on campus?{' '}
            <button
              onClick={() => setCurrentPage('register')}
              className="text-primary font-semibold active:scale-95 transition"
            >
              Create Gerak Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
