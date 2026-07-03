import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, X, Upload, FileText, ShieldAlert, Download, ChevronDown, ChevronLeft, User, Pencil, MapPin, Copy, Check } from 'lucide-react';
import { submitJubahToSheets } from '../lib/sheetsService';
import { JubahLanding } from '../components/JubahLanding';
import { supabase } from '../lib/supabase';

const UNIVERSITIES = [
  'Universiti Malaysia Pahang Al-Sultan Abdullah (Pekan)',
  'Universiti Malaysia Pahang Al-Sultan Abdullah (Gambang)',
];

const UNIVERSITY_FACULTIES: Record<string, string[]> = {
  'Universiti Malaysia Pahang Al-Sultan Abdullah (Pekan)': [
    'FKOM', 'FIST', 'FTKKP', 'FTKMA', 'FTKEE', 'FTKA', 'FTKPM', 'FIM', 'PSM', 'PSK',
  ],
  'Universiti Malaysia Pahang Al-Sultan Abdullah (Gambang)': [
    'FKOM', 'FIST', 'FTKKP', 'FTKMA', 'FTKEE', 'FTKA', 'FTKPM', 'FIM', 'PSM', 'PSK',
  ],
};

const REMARKS = ['Master', 'PHD', 'Degree', 'Diploma'] as const;

const formatIc = (val: string) => {
  const d = val.replace(/\D/g, '').slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
};
const formatPhone = (val: string) => {
  const d = val.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
};

export const Jubah: React.FC = () => {
  const { user, jubahBooking, bookJubah, cancelJubahBooking, setCurrentPage, setSheetOpen } = useApp();

  const [landingUniversity, setLandingUniversity] = useState('');

  const [fullName, setFullName]       = useState('');
  const [icNumber, setIcNumber]       = useState('');
  const [hpNumber, setHpNumber]       = useState('');
  const [university, setUniversity]   = useState('');
  const [faculty, setFaculty]         = useState('');
  const [matricId, setMatricId]       = useState('');
  const [paymentMode, setPaymentMode] = useState<'pickup' | 'postage' | 'deposit'>('pickup');
  const [postageZone, setPostageZone] = useState<'SM' | 'SS'>('SM');
  const [remark, setRemark]           = useState<typeof REMARKS[number]>('Degree');
  const [oscarFile, setOscarFile]         = useState<File | null>(null);
  const [skpgFile, setSkpgFile]           = useState<File | null>(null);
  const [konvoSlipFile, setKonvoSlipFile] = useState<File | null>(null);
  const [icFile, setIcFile]               = useState<File | null>(null);
  const [fileError, setFileError]         = useState('');
  const [combining, setCombining]         = useState(false);
  const [combinedBlob, setCombinedBlob]   = useState<Blob | null>(null);
  const [paymentProof, setPaymentProof]   = useState<File | null>(null);

  const oscarRef       = useRef<HTMLInputElement>(null);
  const skpgRef        = useRef<HTMLInputElement>(null);
  const konvoRef       = useRef<HTMLInputElement>(null);
  const icRef          = useRef<HTMLInputElement>(null);
  const paymentProofRef = useRef<HTMLInputElement>(null);

  const [selectedRiderId,   setSelectedRiderId]   = useState('');
  const [riders,            setRiders]            = useState<{ id: string; name: string; jubah_drop_point: string | null }[]>([]);
  const [ridersLoading,     setRidersLoading]     = useState(false);

  // Address state — only used for postage mode
  const [addressLine1,      setAddressLine1]      = useState('');
  const [addressLine2,      setAddressLine2]      = useState('');
  const [addressPostal,     setAddressPostal]     = useState('');
  const [addressState,      setAddressState]      = useState('');
  const [showAddressSheet,  setShowAddressSheet]  = useState(false);
  // Draft state inside the address sheet
  const [draftLine1,        setDraftLine1]        = useState('');
  const [draftLine2,        setDraftLine2]        = useState('');
  const [draftPostal,       setDraftPostal]       = useState('');
  const [draftState,        setDraftState]        = useState('');

  const fullAddress = [addressLine1, addressLine2, addressPostal, addressState].filter(Boolean).join('\n');

  const openAddressSheet = () => {
    setDraftLine1(addressLine1); setDraftLine2(addressLine2);
    setDraftPostal(addressPostal); setDraftState(addressState);
    setShowAddressSheet(true);
    setSheetOpen(true);
  };
  const saveAddress = () => {
    setAddressLine1(draftLine1.trim()); setAddressLine2(draftLine2.trim());
    setAddressPostal(draftPostal.trim()); setAddressState(draftState.trim());
    setShowAddressSheet(false);
    setSheetOpen(false);
  };
  const closeAddressSheet = () => { setShowAddressSheet(false); setSheetOpen(false); };

  // Pricing state — fetched from jubah_pricing table, kept live via Realtime
  type PricingMap = Record<string, Record<string, number>>; // remark -> mode -> price
  const [pricing, setPricing] = useState<PricingMap>({});
  useEffect(() => {
    const fetchPricing = () =>
      supabase.rpc('get_jubah_pricing').then(({ data }) => {
        if (data) {
          const map: PricingMap = {};
          (data as { remark: string; payment_mode: string; price: number }[]).forEach(r => {
            if (!map[r.remark]) map[r.remark] = {};
            map[r.remark][r.payment_mode] = r.price;
          });
          setPricing(map);
        }
      });

    fetchPricing();

    const channel = supabase
      .channel('jubah_pricing_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jubah_pricing' }, fetchPricing)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const DEPOSIT_AMOUNT = 25;
  const pickupPrice  = pricing[remark]?.['pickup']  ?? 70;
  const postagePrice = pricing[remark]?.['postage'] ?? 90;
  const balanceDue   = pickupPrice - DEPOSIT_AMOUNT;
  const ssCharge     = paymentMode === 'postage' && postageZone === 'SS' ? 10 : 0;
  const cost = paymentMode === 'deposit' ? DEPOSIT_AMOUNT : paymentMode === 'postage' ? postagePrice + ssCharge : pickupPrice;

  // Fetch active riders whenever campus or service option (Pickup/Postage) changes
  useEffect(() => {
    if (!university) { setRiders([]); setSelectedRiderId(''); return; }
    const campus = university.includes('Pekan') ? 'Pekan' : 'Gambang';
    setRidersLoading(true);
    setSelectedRiderId('');
    supabase
      .rpc('get_active_jubah_riders', { p_campus: campus, p_method: paymentMode === 'deposit' ? 'pickup' : paymentMode })
      .then(({ data }) => { setRiders(data ?? []); setRidersLoading(false); });
  }, [university, paymentMode]);

  const allFilesReady = !!(oscarFile && skpgFile && konvoSlipFile && icFile);

  const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
  ) => {
    const file = e.target.files?.[0] || null;
    setFileError('');
    setCombinedBlob(null);
    if (file && !ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Only PDF, JPG or PNG files are accepted.');
      return;
    }
    setFile(file);
  };

  const generateCombinedBlob = async (): Promise<Blob | null> => {
    if (!oscarFile || !skpgFile || !konvoSlipFile || !icFile) return null;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const merged = await PDFDocument.create();
      const addFile = async (f: File) => {
        const bytes = await f.arrayBuffer();
        if (f.type === 'application/pdf') {
          const doc = await PDFDocument.load(bytes);
          const pages = await merged.copyPages(doc, doc.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        } else {
          const page = merged.addPage();
          const img = f.type === 'image/png'
            ? await merged.embedPng(bytes)
            : await merged.embedJpg(bytes);
          const { width, height } = img.scale(1);
          page.setSize(width, height);
          page.drawImage(img, { x: 0, y: 0, width, height });
        }
      };
      for (const f of [oscarFile, skpgFile, konvoSlipFile, icFile]) await addFile(f);
      const pdfBytes = await merged.save();
      return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    } catch (err) {
      console.error('[GERAK] Combine failed:', err);
      return null;
    }
  };

  const handleCombine = async () => {
    if (!oscarFile || !skpgFile || !konvoSlipFile || !icFile) return;
    setCombining(true);
    const blob = await generateCombinedBlob();
    if (blob) setCombinedBlob(blob);
    setCombining(false);
  };

  const handleDownload = () => {
    if (!combinedBlob) return;
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(fullName || 'combined').replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [booking, setBooking] = useState(false);
  const [copied, setCopied]   = useState(false);

  const handleBook = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!university) { alert('Please select your university.'); return; }
    if (!faculty) { alert('Please select your faculty.'); return; }
    if (!selectedRiderId) { alert('Please select a rider.'); return; }
    if (paymentMode === 'postage' && !fullAddress) { alert('Please enter your delivery address.'); return; }
    if (!allFilesReady) { setFileError('Please upload all required documents.'); return; }
    if (!paymentProof) { setFileError('Please upload your proof of payment.'); return; }

    const reference = `JUB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const combinedFileName = `${(fullName || 'combined').replace(/\s+/g, '_')}_combined.pdf`;
    const selectedRider = riders.find(r => r.id === selectedRiderId);
    const bookingCampus = university.includes('Pekan') ? 'Pekan' : 'Gambang';
    const zonePrefix = postageZone === 'SS' ? '[SS - Sabah & Sarawak]\n' : '';
    const addr = paymentMode === 'postage' ? `${zonePrefix}${fullAddress}` : undefined;

    setBooking(true);
    let driveDocsUrl: string | undefined;
    let drivePaymentUrl: string | undefined;
    let driveOscarUrl: string | undefined;
    let driveSkpgUrl: string | undefined;
    let driveKonvoUrl: string | undefined;
    let driveIcUrl: string | undefined;

    const uploadFile = async (file: File, label: string): Promise<string | undefined> => {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const path = `${(fullName || 'student').replace(/\s+/g, '_')}_${label}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('jubah-docs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error || !data) { console.error('[GERAK] Storage upload failed:', error); return undefined; }
      const { data: { publicUrl } } = supabase.storage.from('jubah-docs').getPublicUrl(data.path);
      return publicUrl;
    };

    const blobForUpload = combinedBlob ?? await generateCombinedBlob();

    try {
      const results = await Promise.all([
        blobForUpload
          ? uploadFile(new File([blobForUpload], combinedFileName, { type: 'application/pdf' }), 'combined')
          : Promise.resolve(undefined),
        uploadFile(paymentProof, 'payment'),
        oscarFile    ? uploadFile(oscarFile,    'OSCAR')     : Promise.resolve(undefined),
        skpgFile     ? uploadFile(skpgFile,     'SKPG')      : Promise.resolve(undefined),
        konvoSlipFile ? uploadFile(konvoSlipFile, 'KonvoSlip') : Promise.resolve(undefined),
        icFile       ? uploadFile(icFile,       'IC')        : Promise.resolve(undefined),
      ]);
      [driveDocsUrl, drivePaymentUrl, driveOscarUrl, driveSkpgUrl, driveKonvoUrl, driveIcUrl] = results;
    } catch (err) {
      console.error('[GERAK] Drive upload failed:', err);
    }

    setBooking(false);
    bookJubah(reference, fullName, icNumber, hpNumber, university, faculty, matricId, paymentMode, remark, combinedFileName, cost, balanceDue, selectedRiderId, selectedRider?.name, bookingCampus, addr, driveDocsUrl, drivePaymentUrl, driveOscarUrl, driveSkpgUrl, driveKonvoUrl, driveIcUrl);
    submitJubahToSheets({ reference, fullName, icNumber, hpNumber, university, faculty, matricId, paymentMode, remark, combinedFileName, cost, deliveryAddress: addr, driveDocsUrl, drivePaymentUrl, driveOscarUrl, driveSkpgUrl, driveKonvoUrl, driveIcUrl });
  };

  const UNIVERSITY_LABELS: Record<string, string> = {
    umpsa: 'Universiti Malaysia Pahang Al-Sultan Abdullah',
    uitm:  'Universiti Teknologi MARA (UiTM)',
    umk:   'Universiti Malaysia Kelantan',
    uiam:  'Universiti Islam Antarabangsa Malaysia',
  };

  if (!jubahBooking && !landingUniversity) {
    return <JubahLanding onProceed={setLandingUniversity} />;
  }

  // Non-UMPSA universities: form not yet available
  if (!jubahBooking && landingUniversity !== 'umpsa') {
    return (
      <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4 items-center justify-center text-center">
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-4 mx-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <span className="text-3xl">🎓</span>
          </div>
          <div>
            <h3 className="text-base font-black text-slate-800 m-0">Coming Soon</h3>
            <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
              The booking form for
            </p>
            <p className="text-xs font-black text-blue-600 mt-0.5">
              {UNIVERSITY_LABELS[landingUniversity]}
            </p>
            <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
              is not yet available. We're working on it!
            </p>
          </div>
          <button
            onClick={() => setLandingUniversity('')}
            className="mt-2 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-extrabold px-6 py-2.5 rounded-full shadow-md shadow-blue-500/25 transition cursor-pointer"
          >
            ← Back to University Selection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4">

      {/* HEADER */}
      <div className="mt-4 px-1 flex items-start gap-2">
        {!jubahBooking && (
          <button
            type="button"
            onClick={() => setLandingUniversity('')}
            className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div>
          <h2 className="text-xl font-black m-0 text-slate-800">Convocation Robe Service</h2>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">
            {UNIVERSITY_LABELS[landingUniversity]} · Official Robe Bookings
          </p>
        </div>
      </div>

      {!jubahBooking ? (
        <form onSubmit={handleBook} className="flex flex-col gap-4">

          {/* ── PERSONAL INFORMATION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Personal Information</h3>

            {/* Full Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Full Name <span className="text-danger">*</span>
              </label>
              <p className="text-[9px] text-slate-400 -mt-0.5">Use uppercase letters. Example: MUHAMMAD AMIRUDDIN BIN AHMAD</p>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value.toUpperCase())}
                placeholder="FULL NAME AS PER IC"
                required
                className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* IC Number */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                IC Number <span className="text-danger">*</span>
              </label>
              <p className="text-[9px] text-slate-400 -mt-0.5">Example: 980123-45-6789</p>
              <input
                type="text"
                inputMode="numeric"
                value={icNumber}
                onChange={e => setIcNumber(formatIc(e.target.value))}
                placeholder="980123-45-6789"
                maxLength={14}
                required
                className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* HP Number */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                HP Number <span className="text-danger">*</span>
              </label>
              <p className="text-[9px] text-slate-400 -mt-0.5">Example: 012-34567890 · Our runner will be in touch shortly.</p>
              <input
                type="text"
                inputMode="numeric"
                value={hpNumber}
                onChange={e => setHpNumber(formatPhone(e.target.value))}
                placeholder="012-34567890"
                maxLength={12}
                required
                className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* Matric ID */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Matric ID <span className="text-danger">*</span>
              </label>
              <p className="text-[9px] text-slate-400 -mt-0.5">Use uppercase letters. Example: HB19021</p>
              <input
                type="text"
                value={matricId}
                onChange={e => setMatricId(e.target.value.toUpperCase())}
                placeholder="HB19021"
                required
                className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* ── ACADEMIC INFORMATION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Academic Information</h3>

            {/* University */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Campus <span className="text-danger">*</span>
              </label>
              <div className="relative group">
                <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-blue-500 transition">
                  <span className={`text-xs ${university ? 'font-bold text-slate-700' : 'font-normal text-slate-300'}`}>
                    {university
                      ? (university.includes('Pekan') ? 'UMPSA Pekan' : 'UMPSA Gambang')
                      : 'Select your campus...'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <select
                  value={university}
                  onChange={e => { setUniversity(e.target.value); setFaculty(''); }}
                  required
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ fontSize: '16px' }}
                >
                  <option value="" disabled>Select your campus...</option>
                  {UNIVERSITIES.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Faculty — list changes based on selected university */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Faculty <span className="text-danger">*</span>
              </label>
              <div className={`relative group ${!university ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-blue-500 transition">
                  <span className={`text-xs ${faculty ? 'font-bold text-slate-700' : 'font-normal text-slate-300'}`}>
                    {faculty || (university ? 'Select your faculty...' : 'Select a university first')}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <select
                  value={faculty}
                  onChange={e => setFaculty(e.target.value)}
                  required
                  disabled={!university}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  style={{ fontSize: '16px' }}
                >
                  <option value="" disabled>
                    {university ? 'Select your faculty...' : 'Select a university first'}
                  </option>
                  {(UNIVERSITY_FACULTIES[university] ?? []).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Remark */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Remark <span className="text-danger">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {REMARKS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRemark(r)}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      remark === r
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── SERVICE OPTION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Service Option</h3>

            {/* Deposit */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'deposit' ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="deposit" checked={paymentMode === 'deposit'} onChange={() => setPaymentMode('deposit')} className="mt-0.5 accent-blue-600 shrink-0" />
              <div>
                <span className={`text-xs font-bold block ${paymentMode === 'deposit' ? 'text-blue-700' : 'text-slate-700'}`}>
                  Deposit (RM{DEPOSIT_AMOUNT}) — Pay RM{balanceDue} on Collection
                </span>
                <span className="text-[9px] text-slate-400 leading-relaxed block mt-0.5">
                  Pay RM{DEPOSIT_AMOUNT} now to secure your booking. Pay the remaining RM{balanceDue} <span className="font-bold text-slate-500">1 day before collection day</span> via Track My Order. Cancellation is locked 1 week before collection — deposit is forfeited if cancelled after that.
                </span>
              </div>
            </label>

            {/* Full Pickup */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'pickup' ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="pickup" checked={paymentMode === 'pickup'} onChange={() => setPaymentMode('pickup')} className="mt-0.5 accent-blue-600 shrink-0" />
              <div>
                <span className={`text-xs font-bold block ${paymentMode === 'pickup' ? 'text-blue-700' : 'text-slate-700'}`}>
                  Full Payment (RM{pickupPrice}) — Self Pickup
                </span>
                <span className="text-[9px] text-slate-400 leading-relaxed block mt-0.5">
                  Service charge for pickup only at UMPSA Gambang on your scheduled date. We store, manage and maintain all items (jubah, mortarboard, kad jemputan, cenderahati &amp; selempang) until handover.
                </span>
              </div>
            </label>

            {/* Postage with SM/SS zone toggle */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'postage' ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="postage" checked={paymentMode === 'postage'} onChange={() => setPaymentMode('postage')} className="mt-0.5 accent-blue-600 shrink-0" />
              <div className="flex-1">
                <span className={`text-xs font-bold block ${paymentMode === 'postage' ? 'text-blue-700' : 'text-slate-700'}`}>
                  Postage (RM{postagePrice + (postageZone === 'SS' ? 10 : 0)}) — Pickup &amp; Postage {postageZone}
                </span>
                <span className="text-[9px] text-slate-400 leading-relaxed block mt-0.5">
                  Total weight ≈ 3–4 kg (jubah, mortarboard, kad jemputan, cenderahati &amp; selempang).
                </span>
                {paymentMode === 'postage' && (
                  <div className="flex flex-col gap-1 mt-2" onClick={e => e.preventDefault()}>
                    {(['SM', 'SS'] as const).map(zone => (
                      <button
                        key={zone}
                        type="button"
                        onClick={e => { e.preventDefault(); setPostageZone(zone); }}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-[10px] font-bold transition ${
                          postageZone === zone
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
                        }`}
                      >
                        <span>{zone === 'SM' ? 'SM — Semenanjung Malaysia' : 'SS — Sabah & Sarawak'}</span>
                        <span className={`text-[9px] font-extrabold ${postageZone === zone ? 'text-blue-200' : 'text-slate-400'}`}>
                          {zone === 'SM' ? `RM${postagePrice}` : `RM${postagePrice} + RM10`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {/* Cost HUD */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 mt-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Service Fee</span>
              <span className="text-xl font-black text-slate-800">RM{cost}.00</span>
              {paymentMode === 'postage' && postageZone === 'SS' && (
                <span className="text-[9px] text-slate-400 block mt-0.5">Includes +RM10 SS surcharge</span>
              )}
            </div>

          </div>

          {/* ── RIDER SELECTION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Select Rider
            </h3>
            <div className={`relative group ${!university ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-blue-500 transition">
                <span className={`text-xs ${selectedRiderId ? 'font-bold text-slate-700' : 'font-normal text-slate-300'}`}>
                  {ridersLoading
                    ? 'Loading riders...'
                    : selectedRiderId
                      ? riders.find(r => r.id === selectedRiderId)?.name ?? 'Select a rider...'
                      : university
                        ? riders.length === 0 ? 'No riders available' : 'Select a rider...'
                        : 'Select campus first'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </div>
              <select
                value={selectedRiderId}
                onChange={e => setSelectedRiderId(e.target.value)}
                disabled={!university || ridersLoading || riders.length === 0}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                style={{ fontSize: '16px' }}
              >
                <option value="" disabled>Select a rider...</option>
                {riders.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {university && !ridersLoading && riders.length === 0 && (
              <p className="text-[10px] text-slate-400 font-semibold text-center -mt-2">
                No {paymentMode === 'postage' ? 'postage' : 'self-pickup'} riders available for this campus at the moment.
              </p>
            )}

            {/* Drop Point — read-only, set by admin for the selected rider */}
            {selectedRiderId && paymentMode !== 'postage' && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Drop Point</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3">
                  <span className="text-xs font-bold text-slate-700">
                    {riders.find(r => r.id === selectedRiderId)?.jubah_drop_point || 'Not set yet — contact admin'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── DELIVERY ADDRESS (postage only) ── */}
          {paymentMode === 'postage' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Delivery Address <span className="text-danger">*</span></h3>
              {fullAddress ? (
                <button type="button" onClick={openAddressSheet}
                  className="w-full text-left bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 flex items-start justify-between gap-2 active:bg-slate-100 transition">
                  <pre className="text-xs font-bold text-slate-700 whitespace-pre-wrap font-sans flex-1">{fullAddress}</pre>
                  <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                </button>
              ) : (
                <button type="button" onClick={openAddressSheet}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition active:scale-[0.99]">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs font-bold">Tap to enter delivery address</span>
                </button>
              )}
            </div>
          )}

          {/* ── DOCUMENT UPLOAD ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Upload Documents</h3>

            {/* OSCAR */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">OSCAR <span className="text-danger">*</span></label>
              <input type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.jpg,.png" ref={oscarRef} onChange={e => handleFileSelect(e, setOscarFile)} className="hidden" />
              {!oscarFile ? (
                <button type="button" onClick={() => oscarRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer">
                  <Upload className="w-4 h-4" /><span className="text-xs font-bold">Upload OSCAR</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                  <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-bold text-emerald-700 truncate">{oscarFile.name}</p><p className="text-[9px] text-emerald-500">{(oscarFile.size / 1024).toFixed(1)} KB</p></div>
                  <button type="button" onClick={() => { setOscarFile(null); setCombinedBlob(null); if (oscarRef.current) oscarRef.current.value = ''; }} className="text-slate-400 hover:text-danger transition shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            {/* SKPG */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKPG <span className="text-danger">*</span></label>
              <input type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.jpg,.png" ref={skpgRef} onChange={e => handleFileSelect(e, setSkpgFile)} className="hidden" />
              {!skpgFile ? (
                <button type="button" onClick={() => skpgRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer">
                  <Upload className="w-4 h-4" /><span className="text-xs font-bold">Upload SKPG</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                  <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-bold text-emerald-700 truncate">{skpgFile.name}</p><p className="text-[9px] text-emerald-500">{(skpgFile.size / 1024).toFixed(1)} KB</p></div>
                  <button type="button" onClick={() => { setSkpgFile(null); setCombinedBlob(null); if (skpgRef.current) skpgRef.current.value = ''; }} className="text-slate-400 hover:text-danger transition shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            {/* Konvo Slip */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Konvo Slip <span className="text-danger">*</span></label>
              <input type="file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.jpg,.png" ref={konvoRef} onChange={e => handleFileSelect(e, setKonvoSlipFile)} className="hidden" />
              {!konvoSlipFile ? (
                <button type="button" onClick={() => konvoRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer">
                  <Upload className="w-4 h-4" /><span className="text-xs font-bold">Upload Konvo Slip</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                  <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-bold text-emerald-700 truncate">{konvoSlipFile.name}</p><p className="text-[9px] text-emerald-500">{(konvoSlipFile.size / 1024).toFixed(1)} KB</p></div>
                  <button type="button" onClick={() => { setKonvoSlipFile(null); setCombinedBlob(null); if (konvoRef.current) konvoRef.current.value = ''; }} className="text-slate-400 hover:text-danger transition shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            {/* IC */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">IC (Front &amp; Back) <span className="text-danger">*</span></label>
              <p className="text-[9px] text-slate-400 -mt-0.5">Accepts PDF or image (JPG/PNG)</p>
              <input type="file" accept=".pdf,application/pdf,image/jpeg,image/png" ref={icRef} onChange={e => handleFileSelect(e, setIcFile)} className="hidden" />
              {!icFile ? (
                <button type="button" onClick={() => icRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer">
                  <Upload className="w-4 h-4" /><span className="text-xs font-bold">Upload IC</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                  <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-bold text-emerald-700 truncate">{icFile.name}</p><p className="text-[9px] text-emerald-500">{(icFile.size / 1024).toFixed(1)} KB</p></div>
                  <button type="button" onClick={() => { setIcFile(null); setCombinedBlob(null); if (icRef.current) icRef.current.value = ''; }} className="text-slate-400 hover:text-danger transition shrink-0 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            {fileError && (
              <p className="text-[10px] text-danger font-bold flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> {fileError}
              </p>
            )}
          </div>

          {/* ── COMBINED DOCUMENT ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Combined Document</h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Once all documents are uploaded, generate a single combined PDF to download and review.
            </p>
            {!allFilesReady ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-300">
                <FileText className="w-5 h-5" />
                <span className="text-xs font-bold">Upload all 4 documents above first</span>
              </div>
            ) : combining ? (
              <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                <span className="text-xs font-bold">Combining documents…</span>
              </div>
            ) : combinedBlob ? (
              <button type="button" onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs font-extrabold py-3 rounded-xl shadow-md shadow-emerald-500/20 transition cursor-pointer">
                <Download className="w-4 h-4" />
                Download Combined PDF
              </button>
            ) : (
              <button type="button" onClick={handleCombine}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-extrabold py-3 rounded-xl shadow-md shadow-blue-500/20 transition cursor-pointer">
                <FileText className="w-4 h-4" />
                Generate Combined PDF
              </button>
            )}
          </div>

          {/* ── PROOF OF PAYMENT ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-3">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {paymentMode === 'deposit' ? `Proof of Deposit (RM${DEPOSIT_AMOUNT})` : 'Proof of Payment'}
            </h3>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Upload your <span className="font-bold text-slate-700">{paymentMode === 'deposit' ? `RM${DEPOSIT_AMOUNT} deposit receipt` : 'payment receipt'}</span> (screenshot or PDF). The Book button will activate once uploaded.
            </p>
            <input
              type="file"
              accept=".pdf,application/pdf,image/jpeg,image/png"
              ref={paymentProofRef}
              onChange={e => setPaymentProof(e.target.files?.[0] || null)}
              className="hidden"
            />
            {!paymentProof ? (
              <button
                type="button"
                onClick={() => paymentProofRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl py-4 flex flex-col items-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs font-bold">Upload Receipt</span>
                <span className="text-[9px]">PDF · JPG · PNG accepted</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-emerald-700 truncate">{paymentProof.name}</p>
                  <p className="text-[9px] text-emerald-500 mt-0.5">{(paymentProof.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setPaymentProof(null); if (paymentProofRef.current) paymentProofRef.current.value = ''; }}
                  className="text-slate-400 hover:text-danger transition shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={!paymentProof || booking}
            className={`mx-auto flex items-center gap-2 text-white text-sm font-extrabold px-8 py-2.5 rounded-full transition-all duration-300 active:scale-95 ${
              paymentProof && !booking
                ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/50 ring-2 ring-blue-400/40 animate-pulse-glow cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {booking
              ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-white animate-spin" /> Uploading…</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> Book</>}
          </button>
        </form>

      ) : (
        /* ── TRACKING & RETURN ── */
        <div className="flex flex-col gap-4">

          {/* Reference Number — always shown, critical for guests */}
          <div className="bg-blue-600 rounded-3xl p-5 shadow-md flex flex-col gap-1 text-center">
            <span className="text-[9px] text-blue-100 font-extrabold uppercase tracking-widest">Your Reference Number</span>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-black text-white tracking-wider">{jubahBooking.reference}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(jubahBooking.reference);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 active:scale-90 transition shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
              </button>
            </div>
            <p className="text-[10px] text-blue-100 font-semibold mt-1">
              {user.isLoggedIn
                ? 'You can also track this anytime from your order history.'
                : 'Save this number or your phone number — you\'ll need it to track your delivery.'}
            </p>
            {!user.isLoggedIn && (
              <button
                onClick={() => setCurrentPage('track-jubah')}
                className="mt-2 bg-white text-blue-600 font-extrabold text-xs py-2.5 rounded-2xl active:scale-95 transition"
              >
                Track My Order
              </button>
            )}
          </div>

          {/* Booking Summary */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] text-blue-500 font-extrabold uppercase tracking-wider">Reservation Active</span>
                <h3 className="text-sm font-black text-slate-800 mt-0.5">{jubahBooking.fullName}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {jubahBooking.remark} · {jubahBooking.faculty} · {jubahBooking.matricId}
                </p>
              </div>
              <button onClick={cancelJubahBooking} className="text-xs text-slate-400 hover:text-danger font-bold flex items-center gap-0.5 shrink-0">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-slate-50 rounded-xl p-2.5">
                <span className="text-slate-400 font-bold uppercase tracking-wider block text-[8px]">Service Fee</span>
                <span className="font-black text-slate-700">RM{jubahBooking.cost.toFixed(2)}</span>
                <span className="text-slate-400 block">
                  {jubahBooking.paymentMode === 'postage' ? 'Postage' : jubahBooking.paymentMode === 'deposit' ? 'Deposit' : 'Pickup'}
                  {jubahBooking.paymentMode === 'deposit' && jubahBooking.balanceDue > 0 && (
                    <span className="ml-1 text-amber-600 font-bold">(RM{jubahBooking.balanceDue} due 1 day before collection)</span>
                  )}
                </span>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <span className="text-slate-400 font-bold uppercase tracking-wider block text-[8px]">Document</span>
                <span className="font-bold text-slate-700 truncate block">{jubahBooking.combinedFileName || '—'}</span>
              </div>
            </div>

            {/* Progress steps */}
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Robe Preparation</h4>
            <div className="flex flex-col gap-4 pl-2">
              {[
                { key: 'ordered',   label: 'Order Confirmed',     desc: 'Booking registered in system.' },
                { key: 'cleaning',  label: 'Dry Cleaning',        desc: 'Prepping fabric for convocation.' },
                { key: 'packaging', label: 'Packaging',           desc: 'Wrapped in protective coat bag.' },
                { key: 'delivering', label: jubahBooking.paymentMode === 'postage' ? 'Out for Delivery' : 'Ready for Pickup',
                                    desc: jubahBooking.paymentMode === 'postage' ? 'Rider heading to your address.' : 'Available at collection counter.' },
                { key: 'delivered', label: jubahBooking.paymentMode === 'postage' ? 'Delivered' : 'Collected',
                                    desc: 'Safe in your hands!' },
              ].map((step, idx) => {
                const order = ['ordered', 'cleaning', 'packaging', 'delivering', 'delivered'];
                const currentIdx = order.indexOf(jubahBooking.status);
                const isPast    = currentIdx >= idx;
                const isCurrent = jubahBooking.status === step.key;
                return (
                  <div key={step.key} className="flex gap-4 relative">
                    {idx < 4 && (
                      <div className={`absolute left-2.5 top-6 bottom-0 w-0.5 -translate-x-1/2 ${currentIdx > idx ? 'bg-blue-500' : 'bg-slate-100'}`} />
                    )}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center relative z-10 transition ${isPast ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200'}`}>
                      {isPast && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 -mt-0.5">
                      <h5 className={`text-xs font-bold leading-tight ${isCurrent ? 'text-blue-600 font-black' : isPast ? 'text-slate-700' : 'text-slate-300'}`}>
                        {step.label}
                      </h5>
                      <p className="text-[10px] text-slate-400 mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[8px] text-slate-400 italic mt-1">Status updates in 15-second cycles for demo purposes.</p>
          </div>

        </div>
      )}

      {/* ── ADDRESS BOTTOM SHEET ── */}
      {showAddressSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={closeAddressSheet}>
          <div className="w-full max-w-[480px] max-h-[85vh] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Delivery Address</p>
              <button onClick={closeAddressSheet}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-2 flex flex-col gap-3">
              {[
                { label: 'Address Line 1', placeholder: 'No. 44, Jalan Desa Melur 4/1,', value: draftLine1, set: setDraftLine1 },
                { label: 'Address Line 2', placeholder: 'Taman Bandar Connaught,', value: draftLine2, set: setDraftLine2 },
                { label: 'Postal Code / City', placeholder: '56000 Cheras,', value: draftPostal, set: setDraftPostal },
                { label: 'State / Country', placeholder: 'Kuala Lumpur, Malaysia.', value: draftState, set: setDraftState },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    style={{ fontSize: '12px' }}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-bold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
                  />
                </div>
              ))}
            </div>

            <div className="px-5 pt-3 pb-6 shrink-0 border-t border-slate-100">
              <button
                type="button"
                onClick={saveAddress}
                disabled={!draftLine1.trim() || !draftPostal.trim() || !draftState.trim()}
                className="w-full bg-primary text-white font-extrabold text-xs py-3.5 rounded-2xl shadow-md active:scale-[0.98] transition disabled:opacity-50"
              >
                Save Address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
