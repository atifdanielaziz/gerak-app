import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  RefreshCw, ShoppingBasket, GraduationCap, TrendingUp,
  Upload, FileImage, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { driverIsActive } from './Profile';

type RiderTab = 'daily' | 'jubah' | 'earnings';

export const RiderHome: React.FC = () => {
  const { user, refreshUserData } = useApp();

  const [activeTab, setActiveTab]     = useState<RiderTab>('daily');
  const [toast, setToast]             = useState('');
  const [uploadingDoc, setUploadingDoc] = useState<'ic' | 'license' | null>(null);
  const icDocRef      = useRef<HTMLInputElement>(null);
  const licenseDocRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const isAdminRole = user.role === 'admin' || user.role === 'superadmin';
  const isActive = driverIsActive({ ...user, role: 'driver' }) || isAdminRole;

  // ── Document upload ───────────────────────────────────────────────────────
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ic' | 'license') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('File too large. Max 10MB.'); return; }
    setUploadingDoc(type);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploadingDoc(null); return; }
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, file, { upsert: true });
    if (upErr) { showToast('Upload failed. Please try again.'); setUploadingDoc(null); return; }
    const { data: signed } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? '';
    const col = type === 'ic' ? { ic_url: url } : { license_url: url };
    await supabase.from('profiles').update({ ...col, docs_status: 'pending' }).eq('id', authUser.id);
    setUploadingDoc(null);
    if (e.target) e.target.value = '';
    await refreshUserData();
    showToast(type === 'ic' ? 'IC uploaded!' : 'License uploaded!');
  };

  // ── Gate 1: Document verification ────────────────────────────────────────
  if (!isAdminRole && user.docsStatus !== 'approved') {
    const bothUploaded = !!user.icUrl && !!user.licenseUrl;
    return (
      <div className="flex-grow bg-slate-50 overflow-y-auto no-scrollbar pb-6 px-4 flex flex-col gap-4 animate-fade-in">
        <div className="mt-6 flex flex-col items-center text-center gap-2">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 ${
            user.docsStatus === 'rejected' ? 'bg-red-50 border-red-100' :
            user.docsStatus === 'pending'  ? 'bg-amber-50 border-amber-100' :
            'bg-slate-50 border-slate-200'
          }`}>
            {user.docsStatus === 'rejected' ? <ShieldAlert className="w-7 h-7 text-red-400" /> :
             user.docsStatus === 'pending'  ? <ShieldCheck className="w-7 h-7 text-amber-400" /> :
             <ShieldCheck className="w-7 h-7 text-slate-300" />}
          </div>
          <p className="text-sm font-black text-slate-800">
            {user.docsStatus === 'pending'  ? 'Documents Under Review' :
             user.docsStatus === 'rejected' ? 'Documents Rejected' :
             'Complete Verification'}
          </p>
          <p className="text-xs text-slate-400 font-semibold leading-relaxed max-w-xs">
            {user.docsStatus === 'pending'  ? 'Your documents are being reviewed by admin. You will be notified once approved.' :
             user.docsStatus === 'rejected' ? `Reason: ${user.docsRejectReason || 'Please re-upload correct documents.'}` :
             'Upload your IC (MyKad) and Driving License to get verified as a Gerak Rider.'}
          </p>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Required Documents</h3>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Identity Card (MyKad) *</label>
            <input ref={icDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'ic')} />
            {user.icUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-extrabold text-emerald-700">IC Uploaded ✓</span>
                </div>
                <button onClick={() => icDocRef.current?.click()} className="text-[10px] font-extrabold text-slate-400 underline">
                  {uploadingDoc === 'ic' ? 'Uploading…' : 'Replace'}
                </button>
              </div>
            ) : (
              <button onClick={() => icDocRef.current?.click()} disabled={uploadingDoc === 'ic'}
                className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                {uploadingDoc === 'ic'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                  : <><Upload className="w-4 h-4" /><span className="text-xs font-bold">Upload IC (MyKad)</span></>}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Driving License *</label>
            <input ref={licenseDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'license')} />
            {user.licenseUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-extrabold text-emerald-700">License Uploaded ✓</span>
                </div>
                <button onClick={() => licenseDocRef.current?.click()} className="text-[10px] font-extrabold text-slate-400 underline">
                  {uploadingDoc === 'license' ? 'Uploading…' : 'Replace'}
                </button>
              </div>
            ) : (
              <button onClick={() => licenseDocRef.current?.click()} disabled={uploadingDoc === 'license'}
                className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                {uploadingDoc === 'license'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                  : <><Upload className="w-4 h-4" /><span className="text-xs font-bold">Upload Driving License</span></>}
              </button>
            )}
          </div>

          {bothUploaded && user.docsStatus === 'none' && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
              <p className="text-xs font-extrabold text-amber-700">Documents submitted for review</p>
              <p className="text-[10px] text-amber-500 font-semibold mt-0.5">Admin will verify your documents shortly.</p>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
          <p className="text-[10px] text-slate-400 font-semibold text-center leading-relaxed">
            Your Gerak ID: <span className="font-black text-slate-600">{user.gerakId}</span><br />
            Documents are reviewed within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  // ── Gate 2: Monthly receipt (inactive) ───────────────────────────────────
  if (!isActive && !isAdminRole) {
    return (
      <div className="flex-grow bg-slate-50 flex flex-col items-center justify-center px-8 gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-100 flex items-center justify-center">
          <ShoppingBasket className="w-7 h-7 text-amber-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-slate-800">Account Inactive</p>
          <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed">
            Pay your monthly fee and upload your receipt<br />in Profile to activate your Rider account.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Gerak ID</p>
          <p className="text-sm font-black text-amber-600 mt-0.5">{user.gerakId}</p>
        </div>
      </div>
    );
  }

  // ── Main Rider Hub ────────────────────────────────────────────────────────
  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg text-center">
          {toast}
        </div>
      )}

      <div className="flex-grow bg-slate-50 overflow-y-auto no-scrollbar pb-6 flex flex-col animate-fade-in">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-800 m-0">Rider Hub</h2>
              <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              {user.name} · {user.gerakId} · UMPSA {user.campus}
            </p>
          </div>
          <button
            onClick={() => {}}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 mb-4">
          <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1 shadow-sm">
            {([
              { id: 'daily',    label: 'Daily Job',   icon: ShoppingBasket },
              { id: 'jubah',    label: 'Jubah Job',   icon: GraduationCap },
              { id: 'earnings', label: 'Earnings',    icon: TrendingUp },
            ] as { id: RiderTab; label: string; icon: React.ElementType }[]).map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-extrabold transition ${
                    activeTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-slate-400'
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Daily Job Tab ── */}
        {activeTab === 'daily' && (
          <div className="px-4 flex flex-col items-center justify-center flex-1 gap-3 py-12">
            <div className="w-16 h-16 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center">
              <ShoppingBasket className="w-7 h-7 text-violet-300" />
            </div>
            <p className="text-sm font-black text-slate-700">No Daily Jobs Yet</p>
            <p className="text-xs text-slate-400 font-semibold text-center leading-relaxed max-w-xs">
              Gerak Daily job assignments will appear here. Stay active to receive jobs from customers.
            </p>
          </div>
        )}

        {/* ── Jubah Job Tab ── */}
        {activeTab === 'jubah' && (
          <div className="px-4 flex flex-col items-center justify-center flex-1 gap-3 py-12">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-blue-300" />
            </div>
            <p className="text-sm font-black text-slate-700">No Jubah Jobs Yet</p>
            <p className="text-xs text-slate-400 font-semibold text-center leading-relaxed max-w-xs">
              Jubah delivery assignments from customers will appear here during convocation period.
            </p>
          </div>
        )}

        {/* ── Earnings Tab ── */}
        {activeTab === 'earnings' && (
          <div className="px-4 flex flex-col items-center justify-center flex-1 gap-3 py-12">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-emerald-300" />
            </div>
            <p className="text-sm font-black text-slate-700">No Earnings Yet</p>
            <p className="text-xs text-slate-400 font-semibold text-center leading-relaxed max-w-xs">
              Your completed job earnings will be tracked here.
            </p>
          </div>
        )}

      </div>
    </>
  );
};
