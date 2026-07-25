import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { WaIcon, toWa } from '../lib/whatsapp';
import { getJubahDocSignedUrl } from '../lib/jubahDocs';
import { stampWatermark } from '../lib/watermark';
import {
  JUBAH_STEP_LABEL as STATUS_LABEL, JUBAH_STATUS_STYLE as STATUS_STYLE,
  JUBAH_NEXT_LABEL as NEXT_LABEL, getJubahProgress, jubahWaMsg,
} from '../lib/jubahStatus';
import {
  RefreshCw, ShoppingBasket, GraduationCap, TrendingUp,
  Upload, FileImage, ShieldCheck, ShieldAlert,
  ChevronLeft, Download, ExternalLink, CheckCircle2, XCircle,
} from 'lucide-react';
import { driverIsActive } from './Profile';

type RiderTab    = 'daily' | 'jubah' | 'earnings';
type JubahView   = 'list' | 'card' | 'details';

type JubahJobRow = {
  id: string;
  reference: string;
  full_name: string;
  ic_number: string;
  hp_number: string;
  matric_id: string;
  university: string;
  campus: string;
  faculty: string;
  remark: string;
  payment_mode: string;
  cost: number;
  balance_due: number;
  balance_paid: boolean;
  initial_paid: boolean;
  balance_proof_url: string | null;
  delivery_address: string | null;
  docs_path: string | null;
  payment_path: string | null;
  oscar_path: string | null;
  skpg_path: string | null;
  konvo_path: string | null;
  ic_path: string | null;
  status: string;
  rider_name: string | null;
  created_at: string;
};

const getNextStatus = (job: JubahJobRow): string | null =>
  getJubahProgress(job.status, job.payment_mode).nextStatus;

export const RiderHome: React.FC = () => {
  const { user, refreshUserData, receiptGateActive } = useApp();

  const [activeTab,     setActiveTab]     = useState<RiderTab>('daily');
  const [toast,         setToast]         = useState('');
  const [uploadingDoc,  setUploadingDoc]  = useState<'ic' | 'license' | null>(null);
  const icDocRef      = useRef<HTMLInputElement>(null);
  const licenseDocRef = useRef<HTMLInputElement>(null);

  // Jubah sub-navigation
  const [jubahView,      setJubahView]     = useState<JubahView>('list');
  const [selectedJob,    setSelectedJob]   = useState<JubahJobRow | null>(null);
  const [jubahJobs,      setJubahJobs]     = useState<JubahJobRow[]>([]);
  const [jubahLoading,   setJubahLoading]  = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const isAdminRole = user.role === 'admin' || user.role === 'superadmin';
  const isActive    = driverIsActive({ ...user, role: 'driver' }, receiptGateActive) || isAdminRole;

  // ── Load jubah assignments ────────────────────────────────────────────────
  const loadJubahJobs = useCallback(async () => {
    setJubahLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setJubahLoading(false); return; }
    const { data, error } = await supabase
      .from('jubah_bookings')
      .select('id, reference, full_name, ic_number, hp_number, matric_id, university, campus, faculty, remark, payment_mode, cost, balance_due, balance_paid, initial_paid, balance_proof_url, delivery_address, docs_path, payment_path, oscar_path, skpg_path, konvo_path, ic_path, status, rider_name, created_at')
      .eq('rider_id', authUser.id)
      .order('created_at', { ascending: false });
    if (error) console.error('[GERAK] jubah jobs load error:', error.message);
    setJubahJobs((data as JubahJobRow[]) ?? []);
    setJubahLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'jubah') loadJubahJobs();
  }, [activeTab, loadJubahJobs]);

  // ── Earnings ───────────────────────────────────────────────────────────────
  type JubahEarningRow = {
    reference: string; remark: string; payment_mode: string;
    order_value: number; rider_commission_rate: number; rider_commission_amount: number;
    earned_at: string;
  };
  const [jubahEarnings,        setJubahEarnings]        = useState<JubahEarningRow[]>([]);
  const [jubahEarningsLoading, setJubahEarningsLoading] = useState(false);

  const loadJubahEarnings = useCallback(async () => {
    setJubahEarningsLoading(true);
    const { data, error } = await supabase.rpc('get_rider_jubah_earnings');
    if (error) console.error('[GERAK] jubah earnings load error:', error.message);
    setJubahEarnings((data as JubahEarningRow[]) ?? []);
    setJubahEarningsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'earnings') loadJubahEarnings();
  }, [activeTab, loadJubahEarnings]);

  const totalJubahEarnings = jubahEarnings.reduce((sum, e) => sum + Number(e.rider_commission_amount), 0);

  // ── Browser / gesture back navigation (3→2→1) ────────────────────────────
  useEffect(() => {
    if (activeTab !== 'jubah') return;
    const handlePop = () => {
      setJubahView(prev => {
        if (prev === 'details') return 'card';
        if (prev === 'card')   { setSelectedJob(null); return 'list'; }
        return prev;
      });
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [activeTab]);

  const goToCard = (job: JubahJobRow) => {
    setSelectedJob(job);
    setJubahView('card');
    window.history.pushState({ jubahSubPage: 'card' }, '');
  };

  const goToDetails = () => {
    setJubahView('details');
    window.history.pushState({ jubahSubPage: 'details' }, '');
  };

  const goBack = () => window.history.back();

  // ── Advance status ────────────────────────────────────────────────────────
  const handleAdvanceStatus = async () => {
    if (!selectedJob) return;
    const next = getNextStatus(selectedJob);
    if (!next) return;
    setUpdatingStatus(true);
    const { data, error } = await supabase.rpc('update_jubah_booking_status', {
      p_booking_id: selectedJob.id,
      p_status:     next,
    });
    if (error || !data?.success) {
      console.error('[GERAK] status update failed:', error ?? data?.error);
      showToast('Update failed. Please try again.');
    } else {
      const updated = { ...selectedJob, status: next };
      setSelectedJob(updated);
      setJubahJobs(prev => prev.map(j => j.id === selectedJob.id ? updated : j));
      showToast(`Status updated: ${STATUS_LABEL[next]}`);
    }
    setUpdatingStatus(false);
  };

  // ── Document upload ───────────────────────────────────────────────────────
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ic' | 'license') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('File too large. Max 10MB.'); return; }
    setUploadingDoc(type);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploadingDoc(null); return; }
    let stamped = file;
    try { stamped = await stampWatermark(file); } catch (err) { console.error('[GERAK] Watermark failed, uploading original file:', err); }
    const ext  = stamped.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, stamped, { upsert: true });
    if (upErr) { showToast('Upload failed. Please try again.'); setUploadingDoc(null); return; }
    const { data: signed } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? '';
    const col = type === 'ic' ? { ic_url: url } : { license_url: url };
    const { error: profileErr } = await supabase.from('profiles').update({ ...col, docs_status: 'pending' }).eq('id', authUser.id);
    setUploadingDoc(null);
    if (e.target) e.target.value = '';
    if (profileErr) { showToast('Upload saved, but failed to submit for review. Please try again.'); return; }
    await refreshUserData();
    showToast(type === 'ic' ? 'IC uploaded!' : 'License uploaded!');
  };

  // ── Gate 1: Document verification ────────────────────────────────────────
  if (!isAdminRole && user.docsStatus !== 'approved') {
    const bothUploaded = !!user.icUrl && !!user.licenseUrl;
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 px-5 flex flex-col gap-5 animate-fade-in">
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
          <p className="text-sm font-semibold text-slate-800">
            {user.docsStatus === 'pending'  ? 'Documents Under Review' :
             user.docsStatus === 'rejected' ? 'Documents Rejected' :
             'Complete Verification'}
          </p>
          <p className="text-xs text-slate-400 font-normal leading-relaxed max-w-xs">
            {user.docsStatus === 'pending'  ? 'Your documents are being reviewed by admin. You will be notified once approved.' :
             user.docsStatus === 'rejected' ? `Reason: ${user.docsRejectReason || 'Please re-upload correct documents.'}` :
             'Upload your IC (MyKad) and Driving License to get verified as a Gerak Rider.'}
          </p>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Required Documents</h3>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-500">Identity Card (MyKad) *</label>
            <input ref={icDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'ic')} />
            {user.icUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700">IC Uploaded ✓</span>
                </div>
                <button onClick={() => icDocRef.current?.click()} className="text-xs font-semibold text-slate-400 underline">
                  {uploadingDoc === 'ic' ? 'Uploading…' : 'Replace'}
                </button>
              </div>
            ) : (
              <button onClick={() => icDocRef.current?.click()} disabled={uploadingDoc === 'ic'}
                className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                {uploadingDoc === 'ic'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                  : <><Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload IC (MyKad)</span></>}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-500">Driving License *</label>
            <input ref={licenseDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'license')} />
            {user.licenseUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700">License Uploaded ✓</span>
                </div>
                <button onClick={() => licenseDocRef.current?.click()} className="text-xs font-semibold text-slate-400 underline">
                  {uploadingDoc === 'license' ? 'Uploading…' : 'Replace'}
                </button>
              </div>
            ) : (
              <button onClick={() => licenseDocRef.current?.click()} disabled={uploadingDoc === 'license'}
                className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                {uploadingDoc === 'license'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                  : <><Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload Driving License</span></>}
              </button>
            )}
          </div>

          {bothUploaded && user.docsStatus === 'none' && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
              <p className="text-xs font-semibold text-amber-700">Documents submitted for review</p>
              <p className="text-xs text-amber-500 font-normal mt-0.5">Admin will verify your documents shortly.</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-400 font-normal text-center leading-relaxed">
            Your Gerak ID: <span className="font-semibold text-slate-600">{user.gerakId}</span><br />
            Documents are reviewed within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  // ── Gate 2: Monthly receipt (inactive) ───────────────────────────────────
  if (!isActive) {
    return (
      <div className="flex-grow bg-white flex flex-col items-center justify-center px-8 gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-100 flex items-center justify-center">
          <ShoppingBasket className="w-7 h-7 text-amber-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">Account Inactive</p>
          <p className="text-xs text-slate-400 font-normal mt-1 leading-relaxed">
            Pay your monthly fee and upload your receipt<br />in Profile to activate your Rider account.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-400">Gerak ID</p>
          <p className="text-sm font-semibold text-amber-600 mt-0.5">{user.gerakId}</p>
        </div>
      </div>
    );
  }

  // ── Main Rider Hub ────────────────────────────────────────────────────────
  return (
    <>
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg text-center animate-fade-in">
          {toast}
        </div>
      )}

      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 flex flex-col animate-fade-in">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeTab === 'jubah' && jubahView !== 'list' && (
              <button onClick={goBack}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-primary transition active:scale-90 shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-800 m-0">
                  {activeTab === 'jubah' && jubahView === 'card'    ? 'Job Details' :
                   activeTab === 'jubah' && jubahView === 'details' ? 'Customer Info' :
                   'Rider Hub'}
                </h2>
                {activeTab !== 'jubah' || jubahView === 'list' ? (
                  <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                {activeTab === 'jubah' && jubahView === 'card' && selectedJob
                  ? `${selectedJob.reference} · ${selectedJob.full_name}`
                  : activeTab === 'jubah' && jubahView === 'details' && selectedJob
                  ? `${selectedJob.remark} · ${selectedJob.university}`
                  : `${user.name} · ${user.gerakId} · UMPSA ${user.campus}`}
              </p>
            </div>
          </div>
          {(activeTab !== 'jubah' || jubahView === 'list') && (
            <button onClick={activeTab === 'jubah' ? loadJubahJobs : () => {}}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tab Switcher — hide when in jubah sub-pages */}
        {(activeTab !== 'jubah' || jubahView === 'list') && (
          <div className="px-4 mb-4">
            <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
              {([
                { id: 'daily',    label: 'Daily Job',   icon: ShoppingBasket },
                { id: 'jubah',    label: 'Jubah Job',   icon: GraduationCap },
                { id: 'earnings', label: 'Earnings',    icon: TrendingUp },
              ] as { id: RiderTab; label: string; icon: React.ElementType }[]).map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id}
                    onPointerDown={(e) => { e.preventDefault(); setActiveTab(tab.id); setJubahView('list'); setSelectedJob(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-transform ${
                      activeTab === tab.id ? 'bg-primary text-white' : 'text-slate-400'
                    }`}>
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Daily Job Tab ── */}
        {activeTab === 'daily' && (
          <div className="px-4 flex flex-col items-center justify-center flex-1 gap-3 py-12">
            <div className="w-16 h-16 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center">
              <ShoppingBasket className="w-7 h-7 text-violet-300" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No Daily Jobs Yet</p>
            <p className="text-xs text-slate-400 font-normal text-center leading-relaxed max-w-xs">
              Gerak Daily job assignments will appear here. Stay active to receive jobs from customers.
            </p>
          </div>
        )}

        {/* ── Jubah Job Tab ── */}
        {activeTab === 'jubah' && (
          <div className="px-4 flex flex-col gap-4 flex-1">

            {/* PAGE 1 — Assignment List */}
            {jubahView === 'list' && (
              <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><GraduationCap className="w-4 h-4" /> My Assignments</span>
                  <span className="font-normal text-slate-300 normal-case tracking-normal">{jubahJobs.length} jobs</span>
                </h3>

                {jubahLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
                  </div>
                ) : jubahJobs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="w-14 h-14 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                      <GraduationCap className="w-6 h-6 text-blue-300" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">No Jubah Jobs Yet</p>
                    <p className="text-xs text-slate-400 font-normal text-center leading-relaxed max-w-xs">
                      Jubah delivery assignments from customers will appear here during convocation period.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[500px]">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-xs font-semibold text-slate-400 border-b border-slate-100">
                          <th className="py-2 pr-4 whitespace-nowrap">Reference</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Name</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Remark</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Mode</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Status</th>
                          <th className="py-2 whitespace-nowrap">Confirm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jubahJobs.map(job => {
                          // Was `status !== 'ordered'` for non-deposit modes, which is also
                          // true for 'cancelled' — showing a green "confirmed" check for a
                          // cancelled, unpaid job. Same fix as AdminHome's matching table,
                          // using the explicit initial_paid fact rather than inferring from
                          // status (that inference is exactly what broke the receipt's paid
                          // state once 'cancelled' became a real status, earlier tonight).
                          const isPaid = job.payment_mode === 'deposit' ? job.balance_paid : job.initial_paid;
                          const depositOnly = job.payment_mode === 'deposit' && job.initial_paid && !job.balance_paid;
                          return (
                          <tr key={job.id}
                            onClick={() => goToCard(job)}
                            className="border-b border-slate-50 text-xs hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer">
                            <td className="py-2.5 pr-4 font-mono font-bold text-primary whitespace-nowrap">{job.reference}</td>
                            <td className="py-2.5 pr-4 font-semibold text-slate-800 whitespace-nowrap">{job.full_name}</td>
                            <td className="py-2.5 pr-4 text-slate-500 font-normal whitespace-nowrap">{job.remark}</td>
                            <td className="py-2.5 pr-4 whitespace-nowrap">
                              <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${
                                job.payment_mode === 'deposit' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                job.payment_mode === 'postage' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                                'bg-slate-50 border-slate-200 text-slate-600'
                              }`}>
                                {job.payment_mode === 'deposit' ? 'Deposit' : job.payment_mode === 'postage' ? 'Postage' : 'Pickup'}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 whitespace-nowrap">
                              <span className={`font-semibold px-2 py-0.5 rounded-full border text-xs ${STATUS_STYLE[job.status] ?? 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                {STATUS_LABEL[job.status] ?? job.status}
                              </span>
                            </td>
                            <td className="py-2.5 whitespace-nowrap">
                              {job.status === 'cancelled' ? (
                                <XCircle className="w-4 h-4 text-red-500" />
                              ) : (
                                <CheckCircle2 className={`w-4 h-4 ${isPaid ? 'text-emerald-500' : depositOnly ? 'text-blue-500' : 'text-slate-200'}`} />
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* PAGE 2 — Job Card with stepper */}
            {jubahView === 'card' && selectedJob && (() => {
              const { steps, curStep, notStarted, isDone, nextStatus: nextStat } = getJubahProgress(selectedJob.status, selectedJob.payment_mode);
              return (
                <div className="flex flex-col gap-4">

                  {/* Status stepper card */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

                    {/* Customer summary */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-primary font-semibold">{selectedJob.reference}</p>
                        <h3 className="text-base font-semibold text-slate-800 mt-0.5">{selectedJob.full_name}</h3>
                        <p className="text-xs text-slate-400 font-normal mt-0.5">
                          {selectedJob.remark} · {selectedJob.faculty} · UMPSA {selectedJob.campus}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLE[selectedJob.status] ?? ''}`}>
                        {STATUS_LABEL[selectedJob.status] ?? selectedJob.status}
                      </span>
                    </div>

                    {/* HP + Mode */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-white border border-slate-100 rounded-xl px-3 py-2 flex-1">
                        <span className="text-xs font-semibold text-slate-600">{selectedJob.hp_number}</span>
                        <a href={`https://wa.me/${toWa(selectedJob.hp_number)}?text=${encodeURIComponent(
                          jubahWaMsg(selectedJob.full_name, selectedJob.status, selectedJob.reference, selectedJob.payment_mode, selectedJob.initial_paid, selectedJob.balance_paid, selectedJob.balance_due)
                        )}`} target="_blank" rel="noopener noreferrer"
                          className="text-[#25D366] ml-auto shrink-0">
                          <WaIcon className="w-4 h-4" />
                        </a>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-2 rounded-xl border shrink-0 ${
                        selectedJob.payment_mode === 'deposit' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        selectedJob.payment_mode === 'postage' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                        'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {selectedJob.payment_mode === 'deposit' ? 'Deposit' : selectedJob.payment_mode === 'postage' ? 'Postage' : 'Pickup'}
                      </span>
                    </div>

                    {/* Progress stepper */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1">
                        {steps.map((step, i) => (
                          <React.Fragment key={step}>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-semibold border-2 transition ${
                              i < curStep  ? 'bg-primary border-primary text-white' :
                              i === curStep ? 'bg-white border-primary text-primary' :
                              'bg-white border-slate-200 text-slate-300'
                            }`}>
                              {i < curStep ? '✓' : i + 1}
                            </div>
                            {i < steps.length - 1 && (
                              <div className={`flex-1 h-0.5 rounded-full transition ${i < curStep ? 'bg-primary' : 'bg-slate-200'}`} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="flex justify-between">
                        {steps.map(step => (
                          <span key={step} className="text-[8px] font-semibold text-slate-400 flex-1 text-center first:text-left last:text-right">
                            {STATUS_LABEL[step]}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Delivery address (postage) */}
                    {selectedJob.payment_mode === 'postage' && selectedJob.delivery_address && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                        <p className="text-[8px] font-semibold text-blue-400 mb-1">Delivery Address</p>
                        <p className="text-xs font-normal text-blue-800 leading-relaxed">{selectedJob.delivery_address}</p>
                      </div>
                    )}

                    {/* Balance status (deposit) — hidden before the deposit itself is even
                        paid (notStarted): showing "Balance Due" would imply that's all
                        that's left, when the deposit hasn't been paid either yet. */}
                    {selectedJob.payment_mode === 'deposit' && !notStarted && (
                      <div className={`rounded-xl p-3 border flex items-center justify-between gap-2 ${
                        selectedJob.balance_paid ? 'bg-emerald-50 border-emerald-100' :
                        selectedJob.balance_proof_url ? 'bg-violet-50 border-violet-100' :
                        'bg-amber-50 border-amber-100'
                      }`}>
                        <div>
                          <span className={`text-[8px] font-semibold block ${
                            selectedJob.balance_paid ? 'text-emerald-500' :
                            selectedJob.balance_proof_url ? 'text-violet-500' : 'text-amber-500'
                          }`}>
                            {selectedJob.balance_paid ? 'Balance Paid' :
                             selectedJob.balance_proof_url ? 'Proof Submitted — Pending Admin' : 'Balance Due'}
                          </span>
                          <span className={`text-base font-black ${
                            selectedJob.balance_paid ? 'text-emerald-700' :
                            selectedJob.balance_proof_url ? 'text-violet-700' : 'text-amber-700'
                          }`}>
                            RM{selectedJob.balance_due.toFixed(2)}
                          </span>
                        </div>
                        {selectedJob.balance_proof_url && (
                          <button
                            type="button"
                            onClick={async () => {
                              const win = window.open('', '_blank', 'noopener,noreferrer');
                              const signed = await getJubahDocSignedUrl(selectedJob.balance_proof_url);
                              if (signed && win) win.location.href = signed;
                              else win?.close();
                            }}
                            className="text-xs text-blue-500 font-bold flex items-center gap-0.5 hover:underline shrink-0"
                          >
                            <ExternalLink className="w-2.5 h-2.5" /> proof
                          </button>
                        )}
                      </div>
                    )}

                    {notStarted && selectedJob.status !== 'cancelled' && (
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-center">
                        <p className="text-xs font-semibold text-slate-500">Awaiting Payment Confirmation</p>
                      </div>
                    )}
                    {/* Advance status button — deposit jobs stay gated until the balance is
                        confirmed, matching AdminHome's copy of this button. Without this,
                        tapping it here would just hit the server-side balance gate in
                        update_jubah_booking_status and fail with an unexplained generic
                        error, since the rider is the one actually expected to drive this. */}
                    {!notStarted && !isDone && selectedJob.status !== 'cancelled' && (() => {
                      const balanceGateActive = selectedJob.payment_mode === 'deposit' && !selectedJob.balance_paid;
                      return (
                        <button
                          onClick={handleAdvanceStatus}
                          disabled={updatingStatus || balanceGateActive}
                          className="w-full bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-2xl transition flex items-center justify-center gap-2 text-sm"
                        >
                          {updatingStatus
                            ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                            : balanceGateActive
                              ? 'Awaiting Balance Payment'
                              : `→ ${NEXT_LABEL[nextStat ?? ''] ?? `Mark ${STATUS_LABEL[nextStat ?? '']}`}`}
                        </button>
                      );
                    })()}
                    {isDone && selectedJob.status !== 'cancelled' && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
                        <p className="text-xs font-semibold text-emerald-700">✓ Job Complete</p>
                      </div>
                    )}
                  </div>

                  {/* View Full Details button */}
                  <button
                    onClick={goToDetails}
                    className="w-full bg-white border border-slate-100 text-slate-600 font-semibold py-3 rounded-2xl text-sm transition active:scale-95 active:bg-slate-50"
                  >
                    View Customer Details →
                  </button>
                </div>
              );
            })()}

            {/* PAGE 3 — Customer details (read-only form + downloads) */}
            {jubahView === 'details' && selectedJob && (
              <div className="flex flex-col gap-4">

                {/* Form fields card */}
                <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-slate-700">Booking Information</h3>

                  {([
                    { label: 'Full Name',        value: selectedJob.full_name },
                    { label: 'IC Number',         value: selectedJob.ic_number },
                    { label: 'Phone',             value: selectedJob.hp_number },
                    { label: 'Matric No.',        value: selectedJob.matric_id },
                    { label: 'University',        value: selectedJob.university },
                    { label: 'Campus',            value: `UMPSA ${selectedJob.campus}` },
                    { label: 'Faculty',           value: selectedJob.faculty },
                    { label: 'Remark',            value: selectedJob.remark },
                    { label: 'Payment Mode',      value: selectedJob.payment_mode.charAt(0).toUpperCase() + selectedJob.payment_mode.slice(1) },
                    { label: 'Service Fee',       value: `RM${selectedJob.cost.toFixed(2)}` },
                    ...(selectedJob.payment_mode === 'deposit' ? [{ label: 'Balance Due', value: `RM${selectedJob.balance_due.toFixed(2)}` }] : []),
                    ...(selectedJob.delivery_address ? [{ label: 'Delivery Address', value: selectedJob.delivery_address }] : []),
                    { label: 'Rider Assigned',   value: selectedJob.rider_name ?? '—' },
                    { label: 'Reference',         value: selectedJob.reference },
                  ] as { label: string; value: string }[]).map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-0.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <span className="text-xs font-normal text-slate-400">{label}</span>
                      <span className="text-sm font-semibold text-slate-700 leading-relaxed">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Documents download card */}
                <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-slate-700">Documents</h3>

                  {([
                    { label: 'Combined PDF',    url: selectedJob.docs_path },
                    { label: 'Payment Proof',   url: selectedJob.payment_path },
                    { label: 'OSCAR',           url: selectedJob.oscar_path },
                    { label: 'SKPG',            url: selectedJob.skpg_path },
                    { label: 'Konvo Slip',      url: selectedJob.konvo_path },
                    { label: 'IC Copy',         url: selectedJob.ic_path },
                  ] as { label: string; url: string | null }[]).map(({ label, url }) => (
                    <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <span className="text-sm font-semibold text-slate-700">{label}</span>
                      <button
                        type="button"
                        disabled={!url}
                        onClick={async () => {
                          const win = window.open('', '_blank', 'noopener,noreferrer');
                          const signed = await getJubahDocSignedUrl(url, true);
                          if (signed && win) win.location.href = signed;
                          else win?.close();
                        }}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl border transition shrink-0 ${
                          url
                            ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700 active:scale-95'
                            : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Earnings Tab ── */}
        {activeTab === 'earnings' && (
          <div className="px-4 flex flex-col gap-4">
            {jubahEarningsLoading ? (
              <div className="flex justify-center py-12">
                <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
              </div>
            ) : jubahEarnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12">
                <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-emerald-300" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No Earnings Yet</p>
                <p className="text-xs text-slate-400 font-normal text-center leading-relaxed max-w-xs">
                  Your commission from completed Jubah deliveries will be tracked here.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">Total Earned</span>
                  <span className="text-2xl font-black text-emerald-700">RM{totalJubahEarnings.toFixed(2)}</span>
                  <span className="text-xs font-semibold text-emerald-600 mt-0.5">{jubahEarnings.length} completed {jubahEarnings.length === 1 ? 'order' : 'orders'}</span>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-slate-700">Order Breakdown</h3>
                  <div className="flex flex-col divide-y divide-slate-100">
                    {jubahEarnings.map(e => (
                      <div key={e.reference} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-bold text-primary truncate">{e.reference}</p>
                          <p className="text-xs text-slate-400 font-semibold mt-0.5">
                            {e.remark} · RM{Number(e.order_value).toFixed(2)} order · {e.rider_commission_rate}%
                          </p>
                          <p className="text-xs text-slate-300 font-normal mt-0.5">
                            {new Date(e.earned_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <span className="text-sm font-black text-emerald-600 shrink-0">+RM{Number(e.rider_commission_amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </>
  );
};
