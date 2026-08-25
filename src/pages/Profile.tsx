import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { stampWatermark } from '../lib/watermark';
import { formatIcNumber, formatPhone } from '../lib/format';
import {
  ChevronRight, ChevronLeft, CheckCircle2, HelpCircle, LogOut,
  Camera, Car, Upload, FileImage,
  ShieldCheck, ShieldOff, AlertTriangle, Clock, RefreshCw,
  Headset, Languages, Moon, FileText, Lock, Info, Star, Share2,
  Wallet, MessageSquareText, User, ContactRound, Mars, Venus,
} from 'lucide-react';
import { DigitalProfileCard } from '../components/DigitalProfileCard';

/* Derive active status from verified + non-expired receipt, with gate bypass.
   Covers both driver and rider — both are subject to the same monthly
   receipt gate (see ReceiptsTab.tsx's driver/rider toggle). Was hardcoded
   to 'driver' only, so a rider's own Profile page permanently showed
   "Account inactive" no matter their real receipt status; RiderHome.tsx
   had already worked around this by passing a faked `role: 'driver'` into
   this same function — that workaround is removed below now that the
   function itself handles rider natively. */
const SettingRow = ({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void }) => (
  <button onClick={onClick} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-900" />
      </div>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300" />
  </button>
);

export const driverIsActive = (
  user: { role: string; feeReceiptVerified: boolean; feeReceiptExpiry: string; receiptGateExempt?: boolean },
  gateActive: boolean = true,
) =>
  (user.role === 'driver' || user.role === 'rider') &&
  (!gateActive || user.receiptGateExempt || (
    user.feeReceiptVerified &&
    !!user.feeReceiptExpiry &&
    new Date(user.feeReceiptExpiry) > new Date()
  ));

export const Profile: React.FC = () => {
  const { user, logout, updateProfile, refreshUserData, receiptGateActive, showConfirmModal, setCurrentPage, isPreviewMode, profileEditIntentRef, activeRole } = useApp();

  const isDriver = user.role === 'driver' || user.role === 'rider';
  const isProvider = isDriver || activeRole === 'driver' || activeRole === 'rider' || user.canDrive || user.canRent || user.canTransport;
  const isActive = driverIsActive(user, receiptGateActive);
  const docsApproved = user.docsStatus === 'approved' || user.role === 'admin' || user.role === 'superadmin';

  const [profileView, setProfileView]     = useState<'hub' | 'edit' | 'security'>('hub');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [draftName, setDraftName]         = useState('');
  const [draftMatric, setDraftMatric]     = useState('');
  const [draftEmail, setDraftEmail]       = useState('');
  const [draftPhone, setDraftPhone]       = useState('');
  const [draftGender, setDraftGender]     = useState<'male' | 'female' | ''>('');
  const [draftVehicle, setDraftVehicle]   = useState('');
  const [draftPlate, setDraftPlate]       = useState('');
  const [draftIcNumber, setDraftIcNumber] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showDigitalCard, setShowDigitalCard] = useState(false);

  // Neither drivers nor riders need an IC for their own verification anymore
  // (licence only) — this only governs the plain IC-number text field below
  // for admin/superadmin, a separate pre-existing requirement.
  const requiresIc = ['admin', 'superadmin'].includes(user.role);

  const [uploading, setUploading]       = useState(false);
  const [verifyMsg, setVerifyMsg]       = useState('');
  const [uploadingDoc, setUploadingDoc] = useState<'license' | null>(null);
  const [docMsg, setDocMsg]             = useState('');
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const licenseDocRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Neither drivers nor riders need an IC on file anymore — only a licence.
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setDocMsg('File too large. Max 10MB.'); return; }
    setDocMsg('');
    setUploadingDoc('license');
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploadingDoc(null); return; }
    let stamped = file;
    try { stamped = await stampWatermark(file); } catch (err) { console.error('[GERAK] Watermark failed, uploading original file:', err); }
    const ext  = stamped.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/license.${ext}`;
    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, stamped, { upsert: true });
    if (upErr) { setDocMsg('Upload failed. Please try again.'); setUploadingDoc(null); return; }
    const { data: signed } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? '';
    const { error: profileErr } = await supabase.from('profiles').update({ license_url: url, license_storage_path: path, docs_status: 'pending' }).eq('id', authUser.id);
    setUploadingDoc(null);
    if (e.target) e.target.value = '';
    if (profileErr) { setDocMsg('Upload saved, but failed to submit for review. Please try again.'); return; }
    await refreshUserData();
    setDocMsg('License uploaded — pending admin review.');
  };

  const initSubPage = () => {
    setDraftName(user.name);
    setDraftMatric(user.matricNo);
    setDraftEmail(user.email);
    setDraftPhone(user.phone);
    setDraftGender(user.gender);
    setDraftVehicle(user.vehicle);
    setDraftPlate(user.plateNumber);
    setDraftIcNumber(user.icNumber ?? '');
    setFieldErrors({});
    setProfileView('edit');
  };

  // Header's edit-pencil sets this ref right before navigating here — land
  // straight in the edit sub-page instead of the hub, then clear the flag.
  useEffect(() => {
    if (profileEditIntentRef.current) {
      profileEditIntentRef.current = false;
      initSubPage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoSave = async (field: string) => {
    let updates: Parameters<typeof updateProfile>[0] = {};
    let err = '';
    if (field === 'name') {
      if (!draftName.trim()) err = 'Full name is required.';
      else updates = { name: draftName.trim() };
    } else if (field === 'ic') {
      const digits = draftIcNumber.replace(/\D/g, '');
      if (requiresIc && digits.length !== 12) err = 'Must be 12 digits (e.g. 012345-67-8910).';
      else if (digits.length > 0 && digits.length !== 12) err = 'Must be 12 digits.';
      else updates = { icNumber: draftIcNumber.trim() || undefined };
    } else if (field === 'matric') {
      if (!draftMatric.trim()) err = 'Matric number is required.';
      else updates = { matricNo: draftMatric.trim() };
    } else if (field === 'phone') {
      if (!draftPhone.trim()) err = 'Mobile number is required.';
      else updates = { phone: draftPhone.trim() };
    } else if (field === 'email') {
      if (!draftEmail.trim()) err = 'Email is required.';
      else updates = { email: draftEmail.trim() };
    } else if (field === 'vehicle') {
      updates = { vehicle: draftVehicle.trim() };
    } else if (field === 'plate') {
      updates = { plateNumber: draftPlate.trim().toUpperCase() };
    }
    if (err) { setFieldErrors(prev => ({ ...prev, [field]: err })); return; }
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
    if (Object.keys(updates).length) await updateProfile(updates);
  };

  // Separate from autoSave() — that's built around onBlur of a text input;
  // this is a two-option selector that should persist the moment it's
  // tapped, same as Register.tsx's own gender picker. Guarded against
  // rapid double-tap (in flight → ignore) rather than just letting both
  // requests fire — two concurrent writes racing to resolve out of order
  // could otherwise leave draftGender showing one value while the row that
  // actually won the race silently saved the other. Reverts the optimistic
  // update if the save itself fails, so the button never shows a selection
  // that was never actually persisted.
  const [savingGender, setSavingGender] = useState(false);
  const saveGender = async (value: 'male' | 'female') => {
    if (savingGender) return;
    setSavingGender(true);
    const prev = draftGender;
    setDraftGender(value);
    const { error } = await updateProfile({ gender: value });
    if (error) setDraftGender(prev);
    setSavingGender(false);
  };

  const changePassword = async () => {
    if (passwordSaving) return;
    setPasswordError('');
    setPasswordSaved(false);
    if (!currentPassword) { setPasswordError('Enter your current password.'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
    setPasswordSaving(true);
    // Re-authenticating with the current password before allowing the change
    // is the only way to confirm "this is really the account owner" here —
    // Supabase Auth has no separate "verify password" call, and updateUser()
    // alone would let anyone with an active session (a borrowed device, a
    // hijacked session) silently lock out the real owner with zero proof
    // they knew the existing password.
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verifyError) { setPasswordSaving(false); setPasswordError('Current password is incorrect.'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) { setPasswordError(error.message || 'Could not update password. Please try again.'); return; }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSaved(true);
  };

  const [linkCopied, setLinkCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const shareApp = async () => {
    const shareData = { title: 'Gerak', text: 'Gerak — Smart Campus Platform', url: 'https://www.gerakmy.com' };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled — nothing to do */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      setShareError(false);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setShareError(true);
      setTimeout(() => setShareError(false), 2000);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return;
    setUploadingAvatar(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploadingAvatar(false); return; }
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true, cacheControl: '31536000' });
    if (error) { setUploadingAvatar(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('profile-photos').getPublicUrl(path);
    await updateProfile({ avatarUrl: `${publicUrl}?t=${Date.now()}` });
    setUploadingAvatar(false);
    if (e.target) e.target.value = '';
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

    // Each upload gets its own file (unique name) instead of overwriting a
    // fixed path — the previous receipt survives in fee_receipt_history
    // once this one replaces it as "current" (see the profiles UPDATE
    // trigger, 20260824150000). No more delete-then-upload.
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('driver-receipts').upload(path, file);

    if (upErr) {
      setUploading(false);
      setVerifyMsg('Upload failed. Please try again.');
      return;
    }

    const { data: signed } = await supabase.storage.from('driver-receipts').createSignedUrl(path, 60 * 60 * 24 * 30);
    const url = signed?.signedUrl ?? '';
    await updateProfile({ feeReceiptUrl: url, feeReceiptStoragePath: path });

    // Storage mirrors the DB trigger's 3-archived-plus-current window —
    // this upload plus the 3 before it (4 files); anything older than
    // that has already dropped out of fee_receipt_history too, so its
    // file is now unreferenced and safe to remove.
    const { data: files } = await supabase.storage.from('driver-receipts')
      .list(authUser.id, { sortBy: { column: 'created_at', order: 'desc' } });
    if (files && files.length > 4) {
      const stale = files.slice(4).map(f => `${authUser.id}/${f.name}`);
      await supabase.storage.from('driver-receipts').remove(stale);
    }

    setUploading(false);

    // Every receipt now goes to manual admin review — no AI/auto-verify
    // step (see ReceiptsTab.tsx for the admin Approve/Reject actions).
    if (fileInputRef.current) fileInputRef.current.value = '';
    await refreshUserData();
    setVerifyMsg('Receipt submitted. Awaiting manual admin approval.');
  };

  const handleDeleteAccount = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { alert('Could not verify your session. Please log in again and retry.'); return; }
    const { error } = await supabase.from('account_deletion_requests').insert({
      user_id:   authUser.id,
      email:     user.email,
      full_name: user.name,
      gerak_id:  user.gerakId,
      campus:    user.campus,
    });
    if (error) {
      alert('Could not submit your request — please try again or contact support directly.');
      return;
    }
    alert('Account deletion request submitted. Our team will process it within 24 hours.');
  };

  /* ── Expiry display helpers ── */
  const expiryDate  = user.feeReceiptExpiry ? new Date(user.feeReceiptExpiry) : null;
  const isExpired   = expiryDate ? expiryDate <= new Date() : false;
  const daysLeft    = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000) : null;
  const expiryLabel = expiryDate?.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasReceipt  = !!user.feeReceiptUrl;
  const isRejected  = hasReceipt && !user.feeReceiptVerified && !!user.feeReceiptRejectReason;

  /* ── GUEST VIEW ── */
  if (!user.isLoggedIn || isPreviewMode) {
    const prefRows    = [
      { icon: Languages, label: 'Language', onClick: () => setCurrentPage('language-settings') },
      { icon: Moon, label: 'Appearance', onClick: () => setCurrentPage('appearance-settings') },
    ];
    const supportRows = [
      { icon: HelpCircle, label: 'Help Center', onClick: () => setCurrentPage('help-center') },
      { icon: FileText, label: 'Terms & Conditions', onClick: () => setCurrentPage('terms-of-service') },
      { icon: Lock, label: 'Privacy Policy', onClick: () => setCurrentPage('privacy-policy') },
    ];
    const otherRows   = [
      { icon: Info, label: 'About Gerak', onClick: () => setCurrentPage('about-gerak') },
      { icon: Star, label: 'Rate App', onClick: () => setCurrentPage('rate-app') },
      { icon: Share2, label: shareError ? 'Could not share' : linkCopied ? 'Link Copied!' : 'Share App', onClick: shareApp },
    ];

    return (
      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-y-auto no-scrollbar animate-fade-in">
        <div className="flex justify-end px-5 pt-4">
          <button onClick={() => setCurrentPage('help-center')} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center active:scale-90 transition shrink-0">
            <Headset className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col items-center text-center px-6 pt-3 pb-6">
          <img src="/gerak-brand.png" alt="Gerak" className="w-28 h-auto" />
          <p className="text-slate-400 text-xs mt-0 font-normal">Smart Campus Platform</p>
        </div>

        <div className="px-5 flex flex-col items-center gap-2 mb-8">
          <h3 className="text-2xl font-bold text-slate-800 m-0">Hi there!</h3>
          <p className="text-sm font-normal text-slate-500 text-center leading-relaxed">
            Sign in to access your bookings and all Gerak services.
          </p>
          <button
            onClick={() => setCurrentPage('login')}
            className="w-full bg-primary text-white font-semibold text-sm tracking-widest py-4 rounded-2xl active:scale-[0.99] transition mt-3 uppercase shadow-md shadow-primary/25"
          >
            Login to Continue
          </button>
        </div>

        <div className="px-5 flex flex-col gap-5 mt-auto pb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Preferences</p>
            <div className="flex flex-col gap-2">{prefRows.map(r => <SettingRow key={r.label} {...r} />)}</div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Support</p>
            <div className="flex flex-col gap-2">{supportRows.map(r => <SettingRow key={r.label} {...r} />)}</div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Others</p>
            <div className="flex flex-col gap-2">{otherRows.map(r => <SettingRow key={r.label} {...r} />)}</div>
          </div>
        </div>
      </div>
    );
  }

  const initial = (user.name?.[0] || user.email?.[0] || 'U').toUpperCase();

  /* ── MY PROFILE SUB-PAGE ── */
  if (profileView === 'edit') {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar animate-fade-in pb-8">

        {/* Sub-page header */}
        <div className="px-5 pt-5 pb-2 flex items-center gap-3">
          <button
            onClick={() => setProfileView('hub')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-90 transition shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 m-0 flex-1">My Profile</h1>
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
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center px-6 py-6 gap-2">
          <div className="relative w-20 h-20">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center">
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', fontWeight: 900, color: '#FFFFFF' }}>{initial}</span>
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center active:scale-90 transition shadow-md shadow-primary/20"
            >
              {uploadingAvatar
                ? <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <p className="text-xs font-normal text-slate-400">Tap to change photo</p>
        </div>

        {/* Status banners */}
        {isDriver && !isActive && !isExpired && (
          <div className="mx-5 mb-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-start gap-2">
            <ShieldOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-red-500 leading-relaxed">
              Account <strong>inactive</strong>. Upload your monthly fee receipt below to activate.
            </p>
          </div>
        )}
        {isDriver && isActive && daysLeft !== null && daysLeft <= 3 && (
          <div className="mx-5 mb-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-amber-700 leading-relaxed">
              Expires <strong>{expiryLabel}</strong> ({daysLeft}d left). Re-upload receipt on 1st–3rd.
            </p>
          </div>
        )}
        {isDriver && isExpired && user.feeReceiptVerified && (
          <div className="mx-5 mb-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-red-600 leading-relaxed">
              Monthly fee <strong>expired</strong> on {expiryLabel}. Upload a new receipt.
            </p>
          </div>
        )}

        {/* ── PROFILE FIELDS ── */}
        <div className="px-5 flex flex-col gap-3">

          {/* Gerak ID — read-only */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <span className="text-xs font-semibold text-slate-400 block">Gerak ID</span>
            <span className="text-sm font-normal text-slate-700 mt-1 block">{user.gerakId || '—'}</span>
          </div>

          {/* Full Name */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <span className="text-xs font-semibold text-slate-400 block">Full Name <span className="text-danger">*</span></span>
            <input value={draftName}
              onChange={e => setDraftName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
              onBlur={() => autoSave('name')}
              className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none"
              placeholder="Full name" />
            {fieldErrors.name && <p className="text-xs text-danger font-semibold mt-1">{fieldErrors.name}</p>}
          </div>

          {/* I/C Number */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <span className="text-xs font-semibold text-slate-400 block">
              I/C Number {requiresIc && <span className="text-danger">*</span>}
            </span>
            <input value={draftIcNumber}
              onChange={e => setDraftIcNumber(formatIcNumber(e.target.value))}
              onBlur={() => autoSave('ic')}
              inputMode="numeric"
              className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none font-mono"
              placeholder="e.g. 012345-67-8910" />
            {fieldErrors.ic && <p className="text-xs text-danger font-semibold mt-1">{fieldErrors.ic}</p>}
          </div>

          {/* Matric Number */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <span className="text-xs font-semibold text-slate-400 block">Matric Number <span className="text-danger">*</span></span>
            <input value={draftMatric}
              onChange={e => setDraftMatric(e.target.value.toUpperCase())}
              onBlur={() => autoSave('matric')}
              className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none"
              placeholder="Matric number" />
            {fieldErrors.matric && <p className="text-xs text-danger font-semibold mt-1">{fieldErrors.matric}</p>}
          </div>

          {/* Mobile Number */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <span className="text-xs font-semibold text-slate-400 block">Mobile Number <span className="text-danger">*</span></span>
            <input type="tel" value={draftPhone}
              onChange={e => setDraftPhone(formatPhone(e.target.value))}
              onBlur={() => autoSave('phone')}
              className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none"
              placeholder="e.g. 012-34567890" />
            {fieldErrors.phone && <p className="text-xs text-danger font-semibold mt-1">{fieldErrors.phone}</p>}
          </div>

          {/* Gender — one-time. Once set (here or at Register.tsx sign-up),
              the picker is replaced by a plain read-only value; the backend
              trigger (protect_privileged_profile_columns) pins it too, so
              this isn't just a disabled button a direct API call could
              route around. */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <span className="text-xs font-semibold text-slate-400 block">Gender</span>
            {user.gender ? (
              <span className="text-sm font-normal text-slate-700 mt-1 block">
                {user.gender === 'female' ? 'Female' : 'Male'}
              </span>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {([['male', 'Male', Mars], ['female', 'Female', Venus]] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={savingGender}
                    onPointerDown={e => { e.preventDefault(); saveGender(value); }}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border transition-transform transform-gpu active:scale-[0.99] disabled:opacity-60 ${
                      draftGender === value ? 'border-slate-900 bg-white' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${draftGender === value ? 'text-slate-900' : 'text-slate-400'}`} />
                    <span className={`text-xs font-bold ${draftGender === value ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Email Address */}
          <div className="border border-slate-100 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Email Address <span className="text-danger">*</span></span>
              <span className="flex items-center gap-0.5 bg-emerald-500 text-white text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" /> VERIFIED
              </span>
            </div>
            <input type="email" value={draftEmail}
              onChange={e => setDraftEmail(e.target.value)}
              onBlur={() => autoSave('email')}
              className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none"
              placeholder="Email address" />
            {fieldErrors.email && <p className="text-xs text-danger font-semibold mt-1">{fieldErrors.email}</p>}
          </div>

          {/* ── Driver-only fields ── */}
          {isDriver && (
            <>
              {/* Car Type / Model */}
              <div className="border border-slate-100 rounded-2xl px-4 py-3">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 block"><Car className="w-3 h-3" /> Car Type / Model</span>
                <input value={draftVehicle}
                  onChange={e => setDraftVehicle(e.target.value)}
                  onBlur={() => autoSave('vehicle')}
                  className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none"
                  placeholder="e.g. Perodua Myvi 1.5" />
              </div>

              {/* Plate Number */}
              <div className="border border-slate-100 rounded-2xl px-4 py-3">
                <span className="text-xs font-semibold text-slate-400 block">Plate Number</span>
                <input value={draftPlate}
                  onChange={e => setDraftPlate(e.target.value.toUpperCase())}
                  onBlur={() => autoSave('plate')}
                  className="mt-1 w-full bg-transparent text-sm font-normal text-slate-700 focus:outline-none font-mono tracking-wider"
                  placeholder="e.g. WMY 1234" />
              </div>

              {/* Documents */}
              <div className="border border-slate-100 rounded-2xl px-4 py-3 flex flex-col gap-4">
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

                {/* License Upload */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-400">Driving License</span>
                  <input ref={licenseDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleDocUpload} />
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

              {/* Monthly Fee Receipt */}
              {!docsApproved ? (
                <div className="border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <ShieldOff className="w-4 h-4 text-slate-300 shrink-0" />
                  <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                    Monthly fee activation is available after your documents are verified by admin.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl px-4 py-3 flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 block">
                      <FileImage className="w-3 h-3" /> Monthly Fee Receipt
                    </span>

                    {uploading && (
                      <div className="mt-2 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                        <span className="w-5 h-5 rounded-full border-2 border-amber-300 border-t-amber-600 animate-spin shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700">Uploading receipt…</p>
                          <p className="text-xs text-amber-500 mt-0.5">This takes a few seconds</p>
                        </div>
                      </div>
                    )}

                    {!uploading && isActive && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                          <ShieldCheck className="w-3 h-3" /> Verified
                        </span>
                        <div className="mt-1.5 space-y-0.5">
                          <p className="text-xs text-slate-500 font-normal">Amount: <span className="font-bold text-slate-700">{user.feeReceiptAmount}</span></p>
                          <p className="text-xs text-slate-500 font-normal">Paid: <span className="font-bold text-slate-700">{user.feeReceiptDate}</span></p>
                          <p className="text-xs text-slate-500 font-normal flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Active until: <span className="font-bold text-emerald-600">{expiryLabel}</span>
                            {daysLeft !== null && daysLeft <= 7 && <span className="text-amber-500 font-bold">({daysLeft}d left)</span>}
                          </p>
                        </div>
                        <button onClick={() => fileInputRef.current?.click()}
                          className="mt-2 text-xs font-bold text-primary flex items-center gap-1 cursor-pointer">
                          <RefreshCw className="w-3 h-3" /> Upload new receipt
                        </button>
                      </div>
                    )}

                    {!uploading && !isActive && isExpired && user.feeReceiptVerified && (
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

                    {!uploading && isRejected && (
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

                    {!uploading && hasReceipt && !user.feeReceiptVerified && !user.feeReceiptRejectReason && !isActive && (
                      <div className="mt-2">
                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-2 flex items-start gap-2">
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-700">Awaiting admin approval</p>
                            <p className="text-xs text-amber-500 mt-0.5 leading-relaxed">
                              Your receipt is under review. You will be notified once approved.
                            </p>
                          </div>
                        </div>
                        <button onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 bg-primary text-white font-semibold text-xs px-4 py-2.5 rounded-xl active:scale-95 transition cursor-pointer shadow-md shadow-primary/20">
                          <Upload className="w-3.5 h-3.5" /> Re-upload receipt
                        </button>
                      </div>
                    )}

                    {!uploading && !hasReceipt && !isRejected && (
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

                    {verifyMsg && !uploading && (
                      <p className="mt-2 text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-xl">{verifyMsg}</p>
                    )}

                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                      className="hidden" onChange={handleReceiptUpload} />
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        <div className="mt-8 text-center">
          <button onClick={() => showConfirmModal({
              title: 'Delete Account?',
              message: 'This files a request to permanently delete your account. This action cannot be undone.',
              confirmLabel: 'DELETE',
              onConfirm: handleDeleteAccount,
            })}
            className="text-xs font-semibold text-danger hover:underline active:scale-95 transition cursor-pointer">
            Delete Account
          </button>
        </div>
      </div>
    );
  }

  /* ── SECURITY SETTINGS SUB-PAGE ── */
  if (profileView === 'security') {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar animate-fade-in pb-8">

        {/* Sub-page header */}
        <div className="px-5 pt-5 pb-2 flex items-center gap-3">
          <button
            onClick={() => { setProfileView('hub'); setPasswordError(''); setPasswordSaved(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-90 transition shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-slate-900 m-0 flex-1">Security Settings</h1>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
            <p className="text-sm font-bold text-slate-800 m-0">Change Password</p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => { setCurrentPassword(e.target.value); setPasswordSaved(false); }}
                style={{ fontSize: '16px' }}
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setPasswordSaved(false); }}
                style={{ fontSize: '16px' }}
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setPasswordSaved(false); }}
                style={{ fontSize: '16px' }}
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-sm font-normal text-slate-700 focus:outline-none focus:border-slate-900 transition"
              />
            </div>
            {passwordError && <p className="text-xs text-danger font-semibold">{passwordError}</p>}
            {passwordSaved && <p className="text-xs text-emerald-600 font-semibold">Password updated.</p>}
            <button
              onPointerDown={(e) => { e.preventDefault(); changePassword(); }}
              disabled={passwordSaving}
              className="w-full bg-primary text-white font-semibold py-3 rounded-2xl active:scale-[0.98] disabled:opacity-50 transition mt-1"
            >
              {passwordSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>

      </div>
    );
  }

  /* ── LOGGED-IN: HUB VIEW ── */
  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar animate-fade-in pb-8">

      {showDigitalCard && <DigitalProfileCard profile={{
        name: user.name, role: user.role, phone: user.phone, vehicle: user.vehicle, plateNumber: user.plateNumber,
        status: user.status, avatarUrl: user.avatarUrl, gerakId: user.gerakId,
        canDrive: user.canDrive, canRent: user.canRent, canTransport: user.canTransport,
      }} onClose={() => setShowDigitalCard(false)} />}

      {/* Logout icon */}
      <div className="flex justify-end px-5 pt-4">
        <button
          onClick={() => showConfirmModal({ title: 'Logout', message: 'Are you sure you want to logout?', onConfirm: logout })}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-90 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Avatar + Name + Gerak ID */}
      <div className="flex flex-col items-center px-6 pt-4 pb-6">
        <div className="w-20 h-20 rounded-full overflow-hidden mb-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center">
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', fontWeight: 900, color: '#FFFFFF' }}>{initial}</span>
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-900 m-0">{user.name || 'User'}</h2>
        {user.gerakId && <p className="text-xs font-normal text-slate-400 mt-1">{user.gerakId}</p>}
      </div>

      {/* Quick Actions */}
      <div className="px-5 mb-6">
        <p className="text-sm font-bold text-slate-700 mb-3">Quick Actions</p>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {([
            ...(isProvider ? [{ icon: Wallet, label: 'My Finance', page: 'provider-finance' as const }] : []),
            ...(isProvider ? [{ icon: MessageSquareText, label: 'Feedback', page: 'provider-feedback' as const }] : []),
            { icon: ContactRound, label: 'Profile Card', action: () => setShowDigitalCard(true) },
          ] as { icon: React.ElementType; label: string; page?: 'provider-finance' | 'provider-feedback'; action?: () => void }[]).map(({ icon: Icon, label, page, action }) => (
            <button
              key={label}
              type="button"
              onPointerDown={(event) => {
                if (action) { event.preventDefault(); action(); return; }
                if (!page) return;
                event.preventDefault();
                setCurrentPage(page);
              }}
              className="flex-shrink-0 flex flex-col items-center gap-2 border border-slate-100 rounded-2xl p-4 w-24 active:bg-slate-50 active:scale-[0.98] transition cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Icon className="w-5 h-5 text-slate-900" />
              </div>
              <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Account section */}
      <div className="px-5 mb-5">
        <p className="text-sm font-bold text-slate-700 mb-2">Account</p>
        <div className="flex flex-col gap-2">
          <button onClick={initSubPage} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-slate-900" /></div>
              <span className="text-sm font-semibold text-slate-800">My Profile</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
          <button onClick={() => setProfileView('security')} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><ShieldCheck className="w-4 h-4 text-slate-900" /></div>
              <span className="text-sm font-semibold text-slate-800">Security Settings</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Preferences */}
      <div className="px-5 mb-5">
        <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Preferences</p>
        <div className="flex flex-col gap-2">
          {([
            { icon: Languages, label: 'Language', onClick: () => setCurrentPage('language-settings') },
            { icon: Moon, label: 'Appearance', onClick: () => setCurrentPage('appearance-settings') },
          ] as { icon: React.ElementType; label: string; onClick?: () => void }[]).map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-900" /></div>
                <span className="text-sm font-semibold text-slate-800">{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </div>
      </div>

      {/* Support */}
      <div className="px-5 mb-5">
        <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Support</p>
        <div className="flex flex-col gap-2">
          {([
            { icon: HelpCircle, label: 'Help Center', onClick: () => setCurrentPage('help-center') },
            { icon: FileText, label: 'Terms & Conditions', onClick: () => setCurrentPage('terms-of-service') },
            { icon: Lock, label: 'Privacy Policy', onClick: () => setCurrentPage('privacy-policy') },
          ] as { icon: React.ElementType; label: string; onClick?: () => void }[]).map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-900" /></div>
                <span className="text-sm font-semibold text-slate-800">{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </div>
      </div>

      {/* Others */}
      <div className="px-5">
        <p className="text-xs font-semibold text-slate-400 pl-1 mb-2">Others</p>
        <div className="flex flex-col gap-2">
          {([
            { icon: Info, label: 'About Gerak', onClick: () => setCurrentPage('about-gerak') },
            { icon: Star, label: 'Rate App', onClick: () => setCurrentPage('rate-app') },
            { icon: Share2, label: shareError ? 'Could not share' : linkCopied ? 'Link Copied!' : 'Share App', onClick: shareApp },
          ] as { icon: React.ElementType; label: string; onClick?: () => void }[]).map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={onClick} className="w-full bg-white border border-slate-100 rounded-2xl flex items-center justify-between px-4 py-4 active:bg-slate-50 active:scale-[0.99] transition text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-slate-900" /></div>
                <span className="text-sm font-semibold text-slate-800">{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
