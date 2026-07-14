import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

export const ResetPassword: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) setError(err.message);
    else setDone(true);
  };

  if (done) {
    return (
      <div className="flex-1 bg-white flex flex-col items-center justify-center p-6 gap-4 animate-fade-in h-full">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <p className="text-lg font-bold text-slate-800">Password Updated!</p>
        <p className="text-xs text-slate-400 font-normal text-center leading-relaxed">
          Your password has been changed. You can now sign in with your new password.
        </p>
        <button
          onClick={() => setCurrentPage('login')}
          className="bg-primary text-white font-semibold px-8 py-3 rounded-xl active:scale-95 transition"
        >
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white flex flex-col justify-between p-6 select-none animate-fade-in h-full">

      {/* Branding */}
      <div className="flex flex-col items-center text-center mt-6">
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 mb-3 flex items-center justify-center">
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2.4rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800 m-0">Set New Password</h2>
        <p className="text-slate-400 text-xs mt-1 font-normal">Choose a strong password for your account</p>
      </div>

      {/* Form */}
      <div className="w-full bg-white rounded-3xl p-6 border border-slate-100">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 pl-1">New Password</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-xl py-3 pl-10 pr-10 text-sm text-slate-700 focus:outline-none focus:border-primary focus:bg-white transition"
                placeholder="Min. 6 characters"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="new-password"
                spellCheck={false}
                required
              />
              <button type="button" onPointerDown={e => { e.preventDefault(); setShowPwd(v => !v); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 pl-1">Confirm Password</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-white border border-slate-100 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:border-primary focus:bg-white transition"
                placeholder="Repeat your password"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="new-password"
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
              : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="mb-4" />
    </div>
  );
};
