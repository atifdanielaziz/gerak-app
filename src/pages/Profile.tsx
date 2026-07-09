import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  ChevronRight, CheckCircle2, HelpCircle, Heart, LogOut,
  Pencil, X, Car, Upload, FileImage,
  ShieldCheck, ShieldOff, AlertTriangle, Clock, RefreshCw,
} from 'lucide-react';

/* Derive active status from verified + non-expired receipt, with gate bypass */
export const driverIsActive = (
  user: { role: string; feeReceiptVerified: boolean; feeReceiptExpiry: string; receiptGateExempt?: boolean },
  gateActive: boolean = true,
) =>
  user.role === 'driver' &&
  (!gateActive || user.receiptGateExempt || (
    user.feeReceiptVerified &&
    !!user.feeReceiptExpiry &&
    new Date(user.feeReceiptExpiry) > new Date()
  ));

export const Profile: React.FC = () => {
  const { user, logout, updateProfile, refreshUserData, receiptGateActive } = useApp();

  const isDriver = user.role === 'driver' || user.role === 'rider';
  const isActive = driverIsActive(user, receiptGateActive);
  const docsApproved = user.docsStatus === 'approved' || user.role === 'admin' || user.role === 'superadmin';

  const [editMode, setEditMode]         = useState(false);
  const [draftName, setDraftName]         = useState('');
  const [draftMatric, setDraftMatric]     = useState('');
  const [draftEmail, setDraftEmail]       = useState('');
  const [draftPhone, setDraftPhone]       = useState('');
  const [draftVehicle, setDraftVehicle]   = useState('');
  const [draftPlate, setDraftPlate]       = useState('');
  const [draftIcNumber, setDraftIcNumber] = useState('');

  const requiresIc = ['driver', 'rider', 'admin', 'superadmin'].includes(user.role);

  const formatIcNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 12);
    if (digits.length <= 6) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  };
  const formatPhone = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    return `${d.slice(0, 3)}-${d.slice(3)}`;
  };
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [uploading, setUploading]       = useState(false);
  const [verifying, setVerifying]       = useState(false);
  const [verifyMsg, setVerifyMsg]       = useState('');
  const [uploadingDoc, setUploadingDoc] = useState<'ic' | 'license' | null>(null);
  const [docMsg, setDocMsg]             = useState('');
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const icDocRef      = useRef<HTMLInputElement>(null);
  const licenseDocRef = useRef<HTMLInputElement>(null);

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ic' | 'license') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setDocMsg('File too large. Max 10MB.'); return; }
    setDocMsg('');
    setUploadingDoc(type);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploadingDoc(null); return; }
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, file, { upsert: true });
    if (upErr) { setDocMsg('Upload failed. Please try again.'); setUploadingDoc(null); return; }
    const { data: signed } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? '';
    const col = type === 'ic' ? { ic_url: url } : { license_url: url };
    await supabase.from('profiles').update({ ...col, docs_status: 'pending' }).eq('id', authUser.id);
    setUploadingDoc(null);
    if (e.target) e.target.value = '';
    await refreshUserData();
    setDocMsg(type === 'ic' ? 'IC uploaded — pending admin review.' : 'License uploaded — pending admin review.');
  };

  const enterEdit = () => {
    setDraftName(user.name);
    setDraftMatric(user.matricNo);
    setDraftEmail(user.email);
    setDraftPhone(user.phone);
    setDraftVehicle(user.vehicle);
    setDraftPlate(user.plateNumber);
    setDraftIcNumber(user.icNumber ?? '');
    setSaveError('');
    setEditMode(true);
  };

  const cancelEdit = () => { setEditMode(false); setSaveError(''); };

  const handleSave = async () => {
    setSaveError('');
    if (!draftName.trim())   { setSaveError('Full name is required.'); return; }
    if (!draftMatric.trim()) { setSaveError('Matric number is required.'); return; }
    if (!draftPhone.trim())  { setSaveError('Mobile number is required.'); return; }
    if (!draftEmail.trim())  { setSaveError('Email address is required.'); return; }
    if (requiresIc) {
      const digits = draftIcNumber.replace(/\D/g, '');
      if (digits.length !== 12) { setSaveError('IC Number must be 12 digits (e.g. 012345-67-8910).'); return; }
    }
    setSaving(true);
    const { error } = await updateProfile({
      name:        draftName.trim(),
      matricNo:    draftMatric.trim(),
      email:       draftEmail.trim(),
      phone:       draftPhone.trim(),
      vehicle:     draftVehicle.trim(),
      plateNumber: draftPlate.trim().toUpperCase(),
      icNumber:    requiresIc ? draftIcNumber.trim() : undefined,
    });
    setSaving(false);
    if (error) { setSaveError(error); return; }
    setEditMode(false);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyMsg('');

    if (file.size > 5 * 1024 * 1024) {
      setVerifyMsg('File too large. Please upload an image under 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploading(false); return; }

    // 1. Delete ALL existing files in this driver's folder (any extension)
    const { data: existingFiles } = await supabase.storage
      .from('driver-receipts')
      .list(authUser.id);
    if (existingFiles && existingFiles.length > 0) {
      const oldPaths = existingFiles.map((f: { name: string }) => `${authUser.id}/${f.name}`);
      await supabase.storage.from('driver-receipts').remove(oldPaths);
    }

    // 2. Upload new file
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/monthly_receipt.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('driver-receipts')
      .upload(path, file, { upsert: true });

    if (upErr) {
      setUploading(false);
      setVerifyMsg('Upload failed. Please try again.');
      return;
    }

    // 3. Store signed URL
    const { data: signed } = await supabase.storage
      .from('driver-receipts')
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    const url = signed?.signedUrl ?? '';
    await updateProfile({ feeReceiptUrl: url });
    setUploading(false);

    // 4. If upload day is 4th or later — skip AI, go straight to PENDING for admin approval
    const uploadDay = new Date().getDate();
    if (uploadDay >= 4) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshUserData();
      setVerifyMsg('Receipt submitted. Awaiting manual admin approval.');
      return;
    }

    // 5. 1st–3rd: Call AI verification Edge Function
    setVerifying(true);
    const { data: session } = await supabase.auth.getSession();
    const result = await supabase.functions.invoke('verify-receipt', {
      body: { imagePath: path },
      headers: { Authorization: `Bearer ${session.session?.access_token}` },
    });

    setVerifying(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (result.error) {
      setVerifyMsg('Verification service error. Please try again.');
      return;
    }

    await refreshUserData();
    setVerifyMsg('');
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      alert('Account deletion request submitted. Our team will process it within 24 hours.');
    }
  };

  /* ── Expiry display helpers ── */
  const expiryDate  = user.feeReceiptExpiry ? new Date(user.feeReceiptExpiry) : null;
  const isExpired   = expiryDate ? expiryDate <= new Date() : false;
  const daysLeft    = expiryDate
    ? Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000)
    : null;
  const expiryLabel = expiryDate?.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });

  /* Receipt section state */
  const hasReceipt = !!user.feeReceiptUrl;
  const isRejected = hasReceipt && !user.feeReceiptVerified && !!user.feeReceiptRejectReason;

  return (
    <div className="flex flex-col h-full w-full bg-white overflow-y-auto no-scrollbar animate-fade-in pb-4">

      {/* Page Title */}
      <div className="px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 m-0">Edit profile</h1>
        <div className="flex items-center gap-2">

          {/* Driver status badge — read-only */}
          {isDriver && (
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              isActive
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-red-50 border-red-200 text-red-500'
            }`}>
              {isActive ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
              {isActive ? 'Active' : 'Inactive'}
            </span>
          )}

          {!editMode ? (
            <button onClick={enterEdit}
              className="flex items-center gap-1.5 text-primary text-xs font-bold hover:underline active:scale-95 transition cursor-pointer">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          ) : (
            <button onClick={cancelEdit}
              className="flex items-center gap-1 text-slate-400 text-xs font-bold hover:underline active:scale-95 transition cursor-pointer">
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Inactive hint */}
      {isDriver && !isActive && !isExpired && (
        <div className="mx-5 mt-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-start gap-2">
          <ShieldOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-red-500 leading-relaxed">
            Account <strong>inactive</strong>. Upload your monthly fee receipt below to activate and accept jobs.
          </p>
        </div>
      )}

      {/* Expiry warning */}
      {isDriver && isActive && daysLeft !== null && daysLeft <= 3 && (
        <div className="mx-5 mt-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-700 leading-relaxed">
            Your account expires on <strong>{expiryLabel}</strong> ({daysLeft} day{daysLeft === 1 ? '' : 's'} left).
            Pay RM25 on 1st–3rd of next month and re-upload your receipt.
          </p>
        </div>
      )}

      {/* Expired warning */}
      {isDriver && isExpired && user.feeReceiptVerified && (
        <div className="mx-5 mt-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-red-600 leading-relaxed">
            Your monthly fee <strong>expired</strong> on {expiryLabel}. Upload a new receipt to reactivate.
          </p>
        </div>
      )}

      {/* ── PROFILE FIELDS ── */}
      <div className="px-5 mt-2">

        {/* Gerak ID — read-only, assigned at registration */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-xs font-semibold text-slate-400 block">
              Gerak ID
            </span>
            <span className="text-sm font-normal text-slate-700 mt-1 block">{user.gerakId || '—'}</span>
          </div>
        </div>

        {/* Full Name * */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-xs font-semibold text-slate-400 block">
              Full Name <span className="text-danger">*</span>
            </span>
            {editMode ? (
              <input value={draftName} onChange={e => setDraftName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="Full name" />
            ) : <span className="text-sm font-normal text-slate-700 mt-1 block">{user.name || '—'}</span>}
          </div>
          {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
        </div>

        {/* Matric Number * */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-xs font-semibold text-slate-400 block">
              Matric Number <span className="text-danger">*</span>
            </span>
            {editMode ? (
              <input value={draftMatric} onChange={e => setDraftMatric(e.target.value.toUpperCase())}
                className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="Matric number" />
            ) : <span className="text-sm font-normal text-slate-700 mt-1 block">{user.matricNo || '—'}</span>}
          </div>
          {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
        </div>

        {/* Mobile Number * */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-xs font-semibold text-slate-400 block">
              Mobile Number <span className="text-danger">*</span>
            </span>
            {editMode ? (
              <input type="tel" value={draftPhone} onChange={e => setDraftPhone(formatPhone(e.target.value))}
                className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="e.g. 012-34567890" />
            ) : <span className="text-sm font-normal text-slate-700 mt-1 block">{user.phone || '—'}</span>}
          </div>
          {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
        </div>

        {/* Email Address * */}
        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">
                Email Address <span className="text-danger">*</span>
              </span>
              <span className="flex items-center gap-0.5 bg-emerald-500 text-white text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" /> VERIFIED
              </span>
            </div>
            {editMode ? (
              <input type="email" value={draftEmail} onChange={e => setDraftEmail(e.target.value)}
                className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                placeholder="Email address" />
            ) : <span className="text-sm font-normal text-slate-700 mt-1 block">{user.email || '—'}</span>}
          </div>
          {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
        </div>

        {/* IC Number * — required for driver/rider/admin/superadmin */}
        {requiresIc && (
          <div className="flex items-center justify-between py-4 border-b border-slate-100">
            <div className="flex-1 min-w-0 pr-3">
              <span className="text-xs font-semibold text-slate-400 block">
                IC Number <span className="text-danger">*</span>
              </span>
              {editMode ? (
                <input
                  value={draftIcNumber}
                  onChange={e => setDraftIcNumber(formatIcNumber(e.target.value))}
                  inputMode="numeric"
                  className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                  placeholder="e.g. 012345-67-8910" />
              ) : (
                <span className="text-sm font-normal text-slate-700 mt-1 block">
                  {user.icNumber || <span className="text-danger text-xs font-semibold">Not set — please update</span>}
                </span>
              )}
            </div>
            {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
          </div>
        )}

        {/* ── Driver-only fields ── */}
        {isDriver && (
          <>
            {/* Car Type / Model */}
            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 block">
                  <Car className="w-3 h-3" /> Car Type / Model
                </span>
                {editMode ? (
                  <input value={draftVehicle} onChange={e => setDraftVehicle(e.target.value)}
                    className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                    placeholder="e.g. Perodua Myvi 1.5" />
                ) : <span className="text-sm font-normal text-slate-700 mt-1 block">{user.vehicle || '—'}</span>}
              </div>
              {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
            </div>

            {/* Plate Number */}
            <div className="flex items-center justify-between py-4 border-b border-slate-100">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-xs font-semibold text-slate-400 block">Plate Number</span>
                {editMode ? (
                  <input value={draftPlate} onChange={e => setDraftPlate(e.target.value.toUpperCase())}
                    className="mt-1 w-full bg-white border border-slate-100 rounded-xl py-2 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-primary transition"
                    placeholder="e.g. WMY 1234" />
                ) : <span className="text-sm font-normal text-slate-700 mt-1 block font-mono tracking-wider">{user.plateNumber || '—'}</span>}
              </div>
              {!editMode && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
            </div>

            {/* ── Documents (IC + License) ── */}
            <div className="py-4 border-b border-slate-100 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Documents
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  user.docsStatus === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                  user.docsStatus === 'rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                  user.docsStatus === 'pending'  ? 'bg-amber-50 border-amber-100 text-amber-700' :
                  'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                  {user.docsStatus === 'approved' ? '✓ Verified' :
                   user.docsStatus === 'rejected' ? '✗ Rejected' :
                   user.docsStatus === 'pending'  ? '⏳ Under Review' : 'Not Uploaded'}
                </span>
              </div>

              {user.docsStatus === 'rejected' && user.docsRejectReason && (
                <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3 py-2">
                  Reason: {user.docsRejectReason}
                </p>
              )}

              {docMsg && (
                <p className="text-xs text-emerald-600 font-semibold bg-emerald-50 rounded-xl px-3 py-2">{docMsg}</p>
              )}

              {/* IC Upload */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-400">IC (MyKad)</span>
                <input ref={icDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'ic')} />
                {user.icUrl ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs font-semibold text-emerald-700">IC Uploaded ✓</span>
                    </div>
                    <button onClick={() => icDocRef.current?.click()} disabled={uploadingDoc === 'ic'}
                      className="text-xs font-semibold text-slate-400 underline active:scale-95 transition">
                      {uploadingDoc === 'ic' ? 'Uploading…' : 'Replace'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => icDocRef.current?.click()} disabled={uploadingDoc === 'ic'}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                    {uploadingDoc === 'ic'
                      ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                      : <><Upload className="w-3.5 h-3.5" /><span className="text-xs font-bold">Upload IC (MyKad)</span></>}
                  </button>
                )}
              </div>

              {/* License Upload */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-400">Driving License</span>
                <input ref={licenseDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'license')} />
                {user.licenseUrl ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs font-semibold text-emerald-700">License Uploaded ✓</span>
                    </div>
                    <button onClick={() => licenseDocRef.current?.click()} disabled={uploadingDoc === 'license'}
                      className="text-xs font-semibold text-slate-400 underline active:scale-95 transition">
                      {uploadingDoc === 'license' ? 'Uploading…' : 'Replace'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => licenseDocRef.current?.click()} disabled={uploadingDoc === 'license'}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                    {uploadingDoc === 'license'
                      ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                      : <><Upload className="w-3.5 h-3.5" /><span className="text-xs font-bold">Upload Driving License</span></>}
                  </button>
                )}
              </div>
            </div>

            {/* ── Monthly Fee Receipt — Gate 2: only visible after Gate 1 (docs) approved ── */}
            {!docsApproved ? (
              <div className="flex items-center gap-3 py-4 border-b border-slate-100">
                <ShieldOff className="w-4 h-4 text-slate-300 shrink-0" />
                <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                  Monthly fee activation is available after your documents are verified by admin.
                </p>
              </div>
            ) : (
            <div className="flex items-start justify-between py-4 border-b border-slate-100">
              <div className="flex-1 min-w-0 pr-3">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 block">
                  <FileImage className="w-3 h-3" /> Monthly Fee Receipt
                </span>

                {/* Verifying spinner */}
                {(uploading || verifying) && (
                  <div className="mt-2 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <span className="w-5 h-5 rounded-full border-2 border-amber-300 border-t-amber-600 animate-spin shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700">
                        {uploading ? 'Uploading receipt…' : 'AI is verifying your receipt…'}
                      </p>
                      <p className="text-xs text-amber-500 mt-0.5">This takes a few seconds</p>
                    </div>
                  </div>
                )}

                {/* Verified + active */}
                {!uploading && !verifying && isActive && (
                  <div className="mt-2">
                    <div className="flex-1 min-w-0">
                      <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                        <ShieldCheck className="w-3 h-3" /> AI Verified
                      </span>
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-xs text-slate-500 font-normal">
                          Amount: <span className="font-bold text-slate-700">{user.feeReceiptAmount}</span>
                        </p>
                        <p className="text-xs text-slate-500 font-normal">
                          Paid: <span className="font-bold text-slate-700">{user.feeReceiptDate}</span>
                        </p>
                        <p className="text-xs text-slate-500 font-normal flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Active until: <span className="font-bold text-emerald-600">{expiryLabel}</span>
                          {daysLeft !== null && daysLeft <= 7 && (
                            <span className="text-amber-500 font-bold">({daysLeft}d left)</span>
                          )}
                        </p>
                      </div>
                      <button onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-xs font-bold text-primary flex items-center gap-1 cursor-pointer">
                        <RefreshCw className="w-3 h-3" /> Upload new receipt
                      </button>
                    </div>
                  </div>
                )}

                {/* Verified but expired */}
                {!uploading && !verifying && !isActive && isExpired && user.feeReceiptVerified && (
                  <div className="mt-2">
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-2">
                      <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Receipt expired
                      </p>
                      <p className="text-xs text-red-400 mt-0.5">
                        Previously paid {user.feeReceiptAmount} on {user.feeReceiptDate}.
                        Pay RM25 on 1st–3rd of this month to renew.
                      </p>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 bg-primary text-white font-semibold text-xs px-4 py-2.5 rounded-xl active:scale-95 transition cursor-pointer shadow-md shadow-primary/20">
                      <Upload className="w-3.5 h-3.5" /> Upload new receipt
                    </button>
                  </div>
                )}

                {/* Rejected */}
                {!uploading && !verifying && isRejected && (
                  <div className="mt-2">
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-2">
                      <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Receipt rejected
                      </p>
                      <p className="text-xs text-red-500 leading-relaxed">{user.feeReceiptRejectReason}</p>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 bg-primary text-white font-semibold text-xs px-4 py-2.5 rounded-xl active:scale-95 transition cursor-pointer shadow-md shadow-primary/20">
                      <Upload className="w-3.5 h-3.5" /> Try again
                    </button>
                  </div>
                )}

                {/* Uploaded but pending verification (e.g. network failed mid-verify, or page refreshed) */}
                {!uploading && !verifying && hasReceipt && !user.feeReceiptVerified && !user.feeReceiptRejectReason && !isActive && (
                  <div className="mt-2">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-2 flex items-start gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-700">Awaiting admin approval</p>
                        <p className="text-xs text-amber-500 mt-0.5 leading-relaxed">
                          Your receipt is under review. You will be notified once approved. If rejected, re-upload a clearer image.
                        </p>
                      </div>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 bg-primary text-white font-semibold text-xs px-4 py-2.5 rounded-xl active:scale-95 transition cursor-pointer shadow-md shadow-primary/20">
                      <Upload className="w-3.5 h-3.5" /> Re-upload receipt
                    </button>
                  </div>
                )}

                {/* Not uploaded yet */}
                {!uploading && !verifying && !hasReceipt && !isRejected && (
                  <div>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="mt-2 flex items-center gap-2 bg-red-50 border border-dashed border-red-200 rounded-xl px-4 py-3 text-xs font-bold text-red-400 hover:border-red-400 transition active:scale-95 cursor-pointer w-full">
                      <Upload className="w-4 h-4" />
                      Upload receipt to activate account
                    </button>
                    <p className="text-xs text-slate-400 font-normal mt-1.5 pl-1">
                      JPG / PNG · Maybank, CIMB, DuitNow, TNG accepted
                    </p>
                  </div>
                )}

                {/* Verify error message */}
                {verifyMsg && !uploading && !verifying && (
                  <p className="mt-2 text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-xl">
                    {verifyMsg}
                  </p>
                )}

                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  className="hidden" onChange={handleReceiptUpload} />
              </div>
            </div>
            )}
          </>
        )}

        {/* Save button */}
        {editMode && (
          <div className="pt-4 flex flex-col gap-2">
            {saveError && <p className="text-xs text-danger font-bold text-center">{saveError}</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-primary hover:bg-primary-hover active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-3 rounded-xl shadow-md shadow-primary/20 transition flex items-center justify-center gap-2 cursor-pointer">
              {saving
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : 'Save Changes'}
            </button>
          </div>
        )}
      </div>


      {/* ── ACTIONS ── */}
      <div className="mx-5 mt-5 bg-white border border-slate-100 rounded-3xl p-2.5 flex flex-col gap-1">
        <button onClick={() => alert('Campus Information Guide: gerak connects robe booking portals and shuttle systems.')}
          className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-700">Help &amp; User Guide</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </button>
        <button onClick={() => alert('Simulated Terms of Campus Services')}
          className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 active:scale-[0.99] transition text-left border-t border-slate-50 cursor-pointer">
          <div className="flex items-center gap-3">
            <Heart className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-700">Privacy &amp; Terms</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </button>
        <button onClick={logout}
          className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-danger/5 active:scale-[0.99] transition text-left border-t border-slate-50 group cursor-pointer">
          <div className="flex items-center gap-3">
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-danger" />
            <span className="text-xs font-semibold text-slate-700 group-hover:text-danger">Log Out Session</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-danger" />
        </button>
      </div>

      <div className="mt-8 text-center">
        <button onClick={handleDeleteAccount}
          className="text-xs font-semibold text-danger hover:underline active:scale-95 transition cursor-pointer">
          Delete Account
        </button>
      </div>
    </div>
  );
};
