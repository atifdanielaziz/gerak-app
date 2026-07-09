import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://gerak-app-pied.vercel.app',
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <div className="flex-1 bg-white flex flex-col justify-between p-6 select-none animate-fade-in h-full">

      {/* Branding */}
      <div className="flex flex-col items-center text-center mt-6">
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 mb-3 flex items-center justify-center">
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2.4rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800 m-0">Forgot Password?</h2>
        <p className="text-slate-400 text-xs mt-1 font-normal">
          {sent ? 'Check your inbox' : "Enter your email and we'll send a reset link"}
        </p>
      </div>

      {/* Form or Success */}
      {!sent ? (
        <div className="w-full bg-white rounded-3xl p-6 border border-slate-100">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400 pl-1">
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
                  className="w-full bg-white border border-slate-100 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:border-primary focus:bg-white transition"
                  placeholder="your@email.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 text-xs text-danger font-semibold text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover disabled:bg-slate-200 active:scale-[0.99] text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 mt-2"
            >
              {loading
                ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : 'Send Reset Link'}
            </button>
          </form>
        </div>
      ) : (
        <div className="w-full bg-white rounded-3xl p-6 border border-slate-100 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-slate-800">Reset link sent!</p>
          <p className="text-xs text-slate-400 font-normal leading-relaxed">
            We sent a link to <span className="text-slate-700 font-semibold">{email}</span>.
            Open the email and tap the link to reset your password.
          </p>
        </div>
      )}

      {/* Back */}
      <div className="text-center mb-4">
        <button
          onClick={() => setCurrentPage('login')}
          className="flex items-center gap-1 text-xs text-slate-400 font-semibold mx-auto active:scale-95 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
        </button>
      </div>
    </div>
  );
};
