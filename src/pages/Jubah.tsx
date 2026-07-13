import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, X, Upload, FileText, ShieldAlert, Download, ChevronDown, User, Pencil, MapPin, Copy, Check, Info, GraduationCap, Eye, FileDown } from 'lucide-react';
import { submitJubahToSheets } from '../lib/sheetsService';
import { JubahLanding } from '../components/JubahLanding';
import { supabase } from '../lib/supabase';
import { WaIcon, toWa } from '../lib/whatsapp';

const IcMasked: React.FC<{ ic: string | null }> = ({ ic }) => {
  if (!ic) return <span className="text-slate-800 font-bold text-sm">—</span>;
  const digits = ic.replace(/\D/g, '');
  if (digits.length < 6) return <span className="text-slate-800 font-bold text-sm">{ic}</span>;
  return (
    <span className="font-bold text-sm font-mono">
      <span className="text-slate-800">{digits.slice(0, 6)}</span>
      <span className="text-slate-800">-</span>
      <span className="text-red-500">XX</span>
      <span className="text-slate-800">-</span>
      <span className="text-red-500">XXXX</span>
    </span>
  );
};

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
  const [paymentMode, setPaymentMode]   = useState<'pickup' | 'postage' | 'deposit'>('pickup');
  const [postageZone, setPostageZone]   = useState<'SM' | 'SS'>('SM');
  const [depositMethod, setDepositMethod] = useState<'pickup' | 'postage'>('pickup');
  const [remark, setRemark]           = useState<typeof REMARKS[number]>('Degree');
  type JubahDocField = { id: string; label: string; hint: string | null; position: number };
  const FALLBACK_DOC_FIELDS: JubahDocField[] = [
    { id: 'oscar', label: 'OSCAR',             hint: null,                                   position: 1 },
    { id: 'skpg',  label: 'SKPG',              hint: null,                                   position: 2 },
    { id: 'konvo', label: 'Konvo Slip',         hint: null,                                   position: 3 },
    { id: 'ic',    label: 'IC (Front & Back)',  hint: 'Accepts PDF or image (JPG/PNG)',       position: 4 },
  ];
  const [docFields,      setDocFields]      = useState<JubahDocField[]>(FALLBACK_DOC_FIELDS);
  const [docFiles,       setDocFiles]       = useState<Record<string, File | null>>({});
  const [sampleUrls,    setSampleUrls]    = useState<Record<string, string>>({});
  const [sampleLoaded,  setSampleLoaded]  = useState<Record<string, boolean>>({});
  const [samplePreview, setSamplePreview] = useState<string | null>(null);
  const docRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [fileError, setFileError]         = useState('');
  const [combining, setCombining]         = useState(false);
  const [combinedBlob, setCombinedBlob]   = useState<Blob | null>(null);
  const [paymentProof, setPaymentProof]   = useState<File | null>(null);

  const paymentProofRef = useRef<HTMLInputElement>(null);

  const [selectedRiderId,   setSelectedRiderId]   = useState('');
  const [riders,            setRiders]            = useState<{ id: string; name: string; jubah_drop_point: string | null; ic_number: string | null; phone: string | null }[]>([]);
  const [ridersLoading,     setRidersLoading]     = useState(false);
  const [riderProfileOpen,  setRiderProfileOpen]  = useState(false);

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

  const DEPOSIT_AMOUNT    = 25;
  const pickupPrice       = pricing[remark]?.['pickup']  ?? 70;
  const postagePrice      = pricing[remark]?.['postage'] ?? 90;
  const isPostageDelivery = paymentMode === 'postage' || (paymentMode === 'deposit' && depositMethod === 'postage');
  const ssCharge          = isPostageDelivery && postageZone === 'SS' ? 10 : 0;
  const balanceDue        = paymentMode === 'deposit'
    ? (depositMethod === 'postage' ? postagePrice + ssCharge : pickupPrice) - DEPOSIT_AMOUNT
    : 0;
  const cost = paymentMode === 'deposit' ? DEPOSIT_AMOUNT : paymentMode === 'postage' ? postagePrice + ssCharge : pickupPrice;

  // Fetch active riders whenever campus or service option (Pickup/Postage) changes
  useEffect(() => {
    if (!university) { setRiders([]); setSelectedRiderId(''); return; }
    const campus = university.includes('Pekan') ? 'Pekan' : 'Gambang';
    setRidersLoading(true);
    setSelectedRiderId('');
    supabase
      .rpc('get_active_jubah_riders', { p_campus: campus, p_method: paymentMode === 'deposit' ? depositMethod : paymentMode })
      .then(({ data }) => { setRiders(data ?? []); setRidersLoading(false); });
  }, [university, paymentMode, depositMethod]);

  // Load doc fields for the selected university; fall back to UMPSA then hardcoded defaults
  useEffect(() => {
    if (!landingUniversity) return;
    setDocFiles({});
    setCombinedBlob(null);
    setSampleLoaded({});

    const applyFields = (fields: JubahDocField[], univKey: string) => {
      setDocFields(fields);
      const urls: Record<string, string> = {};
      fields.forEach(f => {
        const { data } = supabase.storage.from('jubah-banners').getPublicUrl(`samples/${univKey}/${f.id}.jpg`);
        urls[f.id] = `${data.publicUrl}?t=${Date.now()}`;
      });
      setSampleUrls(urls);
    };

    const load = async () => {
      const { data } = await supabase
        .from('jubah_doc_fields')
        .select('id, label, hint, position')
        .eq('university_key', landingUniversity)
        .order('position');
      if (data && data.length > 0) { applyFields(data, landingUniversity); return; }
      const { data: defaults } = await supabase
        .from('jubah_doc_fields')
        .select('id, label, hint, position')
        .eq('university_key', 'umpsa')
        .order('position');
      if (defaults && defaults.length > 0) { applyFields(defaults, 'umpsa'); return; }
      applyFields(FALLBACK_DOC_FIELDS, 'umpsa');
    };
    load();
  }, [landingUniversity]);

  const allFilesReady = docFields.length > 0 && docFields.every(f => !!docFiles[f.id]);

  const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, fieldId: string) => {
    const file = e.target.files?.[0] || null;
    setFileError('');
    setCombinedBlob(null);
    if (file && !ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Only PDF, JPG or PNG files are accepted.');
      return;
    }
    setDocFiles(prev => ({ ...prev, [fieldId]: file }));
  };

  const generateCombinedBlob = async (): Promise<Blob | null> => {
    const files = docFields.map(f => docFiles[f.id]).filter((f): f is File => !!f);
    if (files.length !== docFields.length) return null;
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
      for (const f of files) await addFile(f);
      const pdfBytes = await merged.save();
      return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    } catch (err) {
      console.error('[GERAK] Combine failed:', err);
      return null;
    }
  };

  const handleCombine = async () => {
    if (!allFilesReady) return;
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

  // Live status polled from DB (replaces the demo simulation)
  const [liveStatus,     setLiveStatus]     = useState<string | null>(null);
  const [liveRiderName,  setLiveRiderName]  = useState<string | null>(null);
  const [liveRiderPhone, setLiveRiderPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!jubahBooking?.reference) return;
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase
        .from('jubah_bookings')
        .select('status, rider_name, rider_phone')
        .eq('reference', jubahBooking.reference)
        .single();
      if (data && !cancelled) {
        setLiveStatus(data.status);
        setLiveRiderName(data.rider_name ?? null);
        setLiveRiderPhone(data.rider_phone ?? null);
      }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [jubahBooking?.reference]);

  const generateJubahPdf = () => {
    if (!jubahBooking) return;
    const printDate = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    const row = (label: string, value: string) =>
      `<div class="row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;

    const paymentLabel = jubahBooking.paymentMode === 'deposit'
      ? 'Deposit Paid'
      : jubahBooking.paymentMode === 'postage'
      ? 'Full Payment — Postage'
      : 'Full Payment — Self Pickup';

    const paymentBlock = jubahBooking.paymentMode === 'deposit'
      ? row('Payment Mode', 'Deposit') +
        row('Deposit Paid', `RM${jubahBooking.cost.toFixed(2)}`) +
        (jubahBooking.balanceDue > 0
          ? row('Balance Due', `RM${jubahBooking.balanceDue.toFixed(2)}`) +
            row('Balance Due Date', '1 day before collection')
          : '')
      : row('Payment Mode', paymentLabel) +
        row('Amount Paid', `RM${jubahBooking.cost.toFixed(2)}`);

    const riderBlock = liveRiderName
      ? `<hr/>${row('Rider Assigned', liveRiderName)}${liveRiderPhone ? row('Rider Contact', liveRiderPhone) : ''}`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Jubah Delivery Receipt ${jubahBooking.reference}</title>
<style>
body{font-family:monospace;font-size:13px;color:#1e293b;max-width:400px;margin:40px auto;padding:0 20px}
h1{font-size:20px;font-weight:300;margin:0 0 2px}h1 span{color:#ef4444}
.sub{font-size:11px;color:#94a3b8;margin-bottom:24px}
.row{display:flex;justify-content:space-between;margin-bottom:6px;gap:8px}
.lbl{color:#94a3b8;flex-shrink:0}.val{font-weight:700;text-align:right}
hr{border:none;border-top:1px dashed #cbd5e1;margin:12px 0}
.total{font-size:16px}
.ref{font-size:10px;color:#94a3b8;text-align:center;margin-top:24px}
@media print{body{margin:20px auto}}
</style></head><body>
<h1>ger<span>a</span>k</h1>
<div class="sub">Jubah Delivery — Order Receipt</div>
${row('Reference No.', jubahBooking.reference)}
${row('Status', (liveStatus ?? jubahBooking.status).toUpperCase().replace(/_/g, ' '))}
<hr/>
${row('Full Name', jubahBooking.fullName)}
${row('IC Number', jubahBooking.icNumber.replace(/(\d{6})(\d{2})(\d{4})/, '$1-$2-$3'))}
${row('Phone', jubahBooking.hpNumber)}
${row('University', jubahBooking.university)}
${row('Faculty', jubahBooking.faculty)}
${row('Matric ID', jubahBooking.matricId)}
<hr/>
${row('Robe Type', jubahBooking.remark)}
${row('Booking Type', jubahBooking.paymentMode === 'postage' || (jubahBooking.paymentMode === 'deposit') ? 'Postage / Delivery' : 'Self Pickup')}
<hr/>
${paymentBlock}
<div class="row total"><span class="lbl">Total Charged</span><span class="val">RM${jubahBooking.cost.toFixed(2)}</span></div>
${riderBlock}
<div class="ref">Generated by Gerak · ${printDate}</div>
</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;opacity:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (doc) {
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => { iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }, 300);
    }
  };

  const handleBook = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!university) { alert('Please select your university.'); return; }
    if (!faculty) { alert('Please select your faculty.'); return; }
    if (!selectedRiderId) { alert('Please select a rider.'); return; }
    if (isPostageDelivery && !fullAddress) { alert('Please enter your delivery address.'); return; }
    if (!allFilesReady) { setFileError('Please upload all required documents.'); return; }
    if (!paymentProof) { setFileError('Please upload your proof of payment.'); return; }

    const uniAbbrev = university.includes('Pahang') ? 'UMPSA'
      : university.includes('UiTM') || university.includes('MARA') ? 'UiTM'
      : university.includes('Kelantan') ? 'UMK'
      : university.includes('Kebangsaan') ? 'UKM'
      : 'UIA';
    const reference = `JUB-${new Date().getFullYear().toString().slice(-2)}-${uniAbbrev}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const combinedFileName = `${(fullName || 'combined').replace(/\s+/g, '_')}_combined.pdf`;
    const selectedRider = riders.find(r => r.id === selectedRiderId);
    const bookingCampus = university.includes('Pekan') ? 'Pekan' : 'Gambang';
    const zonePrefix = postageZone === 'SS' ? '[SS - Sabah & Sarawak]\n' : '';
    const addr = isPostageDelivery ? `${zonePrefix}${fullAddress}` : undefined;

    setBooking(true);
    let docsPath: string | undefined;
    let paymentPath: string | undefined;
    let oscarPath: string | undefined;
    let skpgPath: string | undefined;
    let konvoPath: string | undefined;
    let icPath: string | undefined;

    // Uploads are foldered by booking reference (not a public URL) so the
    // jubah-docs storage policies can verify ownership later — only
    // admin/superadmin and the assigned rider can read these back. The
    // filename itself (not the folder) also carries the student's name for
    // readability when browsing storage directly — this has no bearing on
    // access control, which only checks the folder (the reference).
    const uploadFile = async (file: File, label: string): Promise<string | undefined> => {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const namePart = (fullName || 'student').replace(/\s+/g, '_');
      const path = `${reference}/${namePart}_${label}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('jubah-docs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error || !data) { console.error('[GERAK] Storage upload failed:', error); return undefined; }
      return data.path;
    };

    const blobForUpload = combinedBlob ?? await generateCombinedBlob();

    try {
      const docUploads = await Promise.all(
        docFields.map(f => {
          const file = docFiles[f.id];
          return file ? uploadFile(file, f.label.replace(/\s+/g,'_')) : Promise.resolve(undefined);
        })
      );
      const results = await Promise.all([
        blobForUpload
          ? uploadFile(new File([blobForUpload], combinedFileName, { type: 'application/pdf' }), 'combined')
          : Promise.resolve(undefined),
        uploadFile(paymentProof, 'payment'),
      ]);
      [docsPath, paymentPath] = results;
      oscarPath = docUploads[0];
      skpgPath  = docUploads[1];
      konvoPath = docUploads[2];
      icPath    = docUploads[3];
    } catch (err) {
      console.error('[GERAK] Storage upload failed:', err);
    }

    setBooking(false);
    bookJubah(reference, fullName, icNumber, hpNumber, university, faculty, matricId, paymentMode, remark, combinedFileName, cost, balanceDue, selectedRiderId, selectedRider?.name, bookingCampus, addr, docsPath, paymentPath, oscarPath, skpgPath, konvoPath, icPath);
    submitJubahToSheets({ reference, fullName, icNumber, hpNumber, university, faculty, matricId, paymentMode, remark, combinedFileName, cost, deliveryAddress: addr, docsPath, paymentPath, oscarPath, skpgPath, konvoPath, icPath });
  };

  const UNIVERSITY_LABELS: Record<string, string> = {
    umpsa: 'Universiti Malaysia Pahang Al-Sultan Abdullah',
    uitm:  'Universiti Teknologi MARA (UiTM)',
    umk:   'Universiti Malaysia Kelantan',
    ukm:   'Universiti Kebangsaan Malaysia',
    uiam:  'Universiti Islam Antarabangsa Malaysia',
  };

  if (!jubahBooking && !landingUniversity) {
    return <JubahLanding onProceed={setLandingUniversity} />;
  }

  // Non-UMPSA universities: form not yet available
  if (!jubahBooking && landingUniversity !== 'umpsa') {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 px-5 animate-fade-in flex flex-col gap-5 items-center justify-center text-center">
        <div className="bg-white border border-slate-100 rounded-3xl p-8 flex flex-col items-center gap-4 mx-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-amber-400" />
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
            className="mt-2 text-xs font-normal text-slate-400 hover:text-primary transition active:scale-95"
          >
            ← Change university
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex-grow bg-white overflow-y-auto overflow-x-hidden no-scrollbar pb-4 px-5 animate-fade-in flex flex-col gap-5">

      {/* HEADER */}
      <div className="mt-4 px-1">
        <h2 className="text-xl font-black m-0 text-slate-800">Convocation Robe Service</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1">
          {UNIVERSITY_LABELS[landingUniversity]} · Official Robe Bookings
        </p>
        {!jubahBooking && (
          <button
            type="button"
            onClick={() => setLandingUniversity('')}
            className="mt-1 text-xs font-normal text-slate-400 hover:text-primary transition active:scale-95"
          >
            ← Change university
          </button>
        )}
      </div>

      {!jubahBooking ? (
        <form onSubmit={handleBook} className="flex flex-col gap-4">

          {/* ── PERSONAL INFORMATION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Personal Information</h3>

            {/* Full Name */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400">
                Full Name <span className="text-danger">*</span>
              </label>
              <p className="text-xs text-slate-400 -mt-0.5">Use uppercase letters. Example: MUHAMMAD AMIRUDDIN BIN AHMAD</p>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value.toUpperCase())}
                placeholder="FULL NAME AS PER IC"
                required
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* IC Number */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400">
                IC Number <span className="text-danger">*</span>
              </label>
              <p className="text-xs text-slate-400 -mt-0.5">Example: 980123-45-6789</p>
              <input
                type="text"
                inputMode="numeric"
                value={icNumber}
                onChange={e => setIcNumber(formatIc(e.target.value))}
                placeholder="980123-45-6789"
                maxLength={14}
                required
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* HP Number */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400">
                HP Number <span className="text-danger">*</span>
              </label>
              <p className="text-xs text-slate-400 -mt-0.5">Example: 012-34567890 · Our runner will be in touch shortly.</p>
              <input
                type="text"
                inputMode="numeric"
                value={hpNumber}
                onChange={e => setHpNumber(formatPhone(e.target.value))}
                placeholder="012-34567890"
                maxLength={12}
                required
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* Matric ID */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400">
                Matric ID <span className="text-danger">*</span>
              </label>
              <p className="text-xs text-slate-400 -mt-0.5">Use uppercase letters. Example: HB19021</p>
              <input
                type="text"
                value={matricId}
                onChange={e => setMatricId(e.target.value.toUpperCase())}
                placeholder="HB19021"
                required
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* ── ACADEMIC INFORMATION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Academic Information</h3>

            {/* University */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">
                Campus <span className="text-danger">*</span>
              </label>
              <div className="relative group">
                <div className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-blue-500 transition">
                  <span className={`text-xs ${university ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}`}>
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
              <label className="text-xs font-semibold text-slate-400">
                Faculty <span className="text-danger">*</span>
              </label>
              <div className={`relative group ${!university ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-blue-500 transition">
                  <span className={`text-xs ${faculty ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}`}>
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
              <label className="text-xs font-semibold text-slate-400">
                Remark <span className="text-danger">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {REMARKS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRemark(r)}
                    className={`py-2 rounded-xl text-xs font-semibold border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 ${
                      remark === r
                        ? 'border-slate-900 text-slate-900'
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
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Service Option</h3>

            {/* Deposit */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'deposit' ? 'border-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="deposit" checked={paymentMode === 'deposit'} onChange={() => setPaymentMode('deposit')} className="mt-0.5 accent-slate-900 shrink-0" />
              <div className="flex-1">
                <span className={`text-xs font-semibold block ${paymentMode === 'deposit' ? 'text-slate-900' : 'text-slate-700'}`}>
                  Deposit (RM{DEPOSIT_AMOUNT}) — Pay RM{balanceDue} before robe Collection date
                </span>
                <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                  Pay RM{DEPOSIT_AMOUNT} now to secure your booking. Pay the remaining RM{balanceDue} <span className="font-bold text-slate-500">1 day before collection day</span> via Track My Order. Cancellation is locked 1 week before collection — deposit is forfeited if cancelled after that.
                </span>

                {/* Sub-choices: Self Pickup or Pickup & Postage */}
                {paymentMode === 'deposit' && (
                  <div className="flex flex-col gap-1 mt-3" onClick={e => e.preventDefault()}>
                    {/* Self Pickup */}
                    <button
                      type="button"
                      onClick={() => setDepositMethod('pickup')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border text-xs font-semibold transition active:scale-[0.99] ${
                        depositMethod === 'pickup'
                          ? 'border-slate-900 bg-white text-slate-900'
                          : 'border-slate-100 bg-white text-slate-600'
                      }`}
                    >
                      <span className="flex-1 text-left">Self Pickup</span>
                      <span className={`shrink-0 ml-2 font-normal text-xs ${depositMethod === 'pickup' ? 'text-slate-500' : 'text-slate-400'}`}>
                        Balance RM{pickupPrice - DEPOSIT_AMOUNT}
                      </span>
                    </button>

                    {/* Pickup & Postage */}
                    <button
                      type="button"
                      onClick={() => setDepositMethod('postage')}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border text-xs font-semibold transition active:scale-[0.99] ${
                        depositMethod === 'postage'
                          ? 'border-slate-900 bg-white text-slate-900'
                          : 'border-slate-100 bg-white text-slate-600'
                      }`}
                    >
                      <span>Pickup &amp; Postage</span>
                    </button>

                    {/* SM / SS sub-choice under Pickup & Postage */}
                    {depositMethod === 'postage' && (
                      <div className="flex flex-col gap-1 ml-2 mt-0.5">
                        {(['SM', 'SS'] as const).map(zone => (
                          <button
                            key={zone}
                            type="button"
                            onClick={() => setPostageZone(zone)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border text-xs font-semibold transition active:scale-[0.99] ${
                              postageZone === zone
                                ? 'border-slate-900 bg-white text-slate-900'
                                : 'border-slate-100 bg-white text-slate-600'
                            }`}
                          >
                            <span className="flex-1 text-left">{zone === 'SM' ? 'SM — Semenanjung Malaysia' : 'SS — Sabah & Sarawak'}</span>
                            <span className={`shrink-0 ml-2 font-normal text-xs ${postageZone === zone ? 'text-slate-500' : 'text-slate-400'}`}>
                              Balance RM{postagePrice + (zone === 'SS' ? 10 : 0) - DEPOSIT_AMOUNT}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </label>

            {/* Full Pickup */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'pickup' ? 'border-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="pickup" checked={paymentMode === 'pickup'} onChange={() => setPaymentMode('pickup')} className="mt-0.5 accent-slate-900 shrink-0" />
              <div>
                <span className={`text-xs font-semibold block ${paymentMode === 'pickup' ? 'text-slate-900' : 'text-slate-700'}`}>
                  Full Payment (RM{pickupPrice}) — Self Pickup
                </span>
                <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                  Service charge for pickup only at UMPSA Gambang on your scheduled date. We store, manage and maintain all items (jubah, mortarboard, kad jemputan, cenderahati &amp; selempang) until handover.
                </span>
              </div>
            </label>

            {/* Postage with SM/SS zone toggle */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'postage' ? 'border-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="postage" checked={paymentMode === 'postage'} onChange={() => setPaymentMode('postage')} className="mt-0.5 accent-slate-900 shrink-0" />
              <div className="flex-1">
                <span className={`text-xs font-semibold block ${paymentMode === 'postage' ? 'text-slate-900' : 'text-slate-700'}`}>
                  Postage (RM{postagePrice + (postageZone === 'SS' ? 10 : 0)}) — Pickup &amp; Postage {postageZone}
                </span>
                <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                  Total weight ≈ 3–4 kg (jubah, mortarboard, kad jemputan, cenderahati &amp; selempang).
                </span>
                {paymentMode === 'postage' && (
                  <div className="flex flex-col gap-1 mt-2" onClick={e => e.preventDefault()}>
                    {(['SM', 'SS'] as const).map(zone => (
                      <button
                        key={zone}
                        type="button"
                        onClick={e => { e.preventDefault(); setPostageZone(zone); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl border text-xs font-semibold transition active:scale-[0.99] ${
                          postageZone === zone
                            ? 'border-slate-900 bg-white text-slate-900'
                            : 'border-slate-100 bg-white text-slate-600'
                        }`}
                      >
                        <span className="flex-1 text-left">{zone === 'SM' ? 'SM — Semenanjung Malaysia' : 'SS — Sabah & Sarawak'}</span>
                        <span className={`shrink-0 ml-2 font-normal text-xs ${postageZone === zone ? 'text-slate-500' : 'text-slate-400'}`}>
                          {zone === 'SM' ? `RM${postagePrice}` : `RM${postagePrice}+RM10`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            {/* Cost HUD */}
            <div className="border border-slate-100 rounded-2xl p-3.5 mt-1">
              <span className="text-xs text-slate-400 font-semibold block">Service Fee</span>
              <span className="text-xl font-black text-slate-800">RM{cost}.00</span>
              {isPostageDelivery && postageZone === 'SS' && (
                <span className="text-xs text-slate-400 block mt-0.5">Includes +RM10 SS surcharge</span>
              )}
            </div>

          </div>

          {/* ── RIDER SELECTION ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Select Rider
            </h3>
            <div className="flex items-center gap-2">
              <div className={`relative group flex-1 ${!university ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 flex items-center justify-between pointer-events-none group-focus-within:border-blue-500 transition">
                  <span className={`text-xs ${selectedRiderId ? 'font-semibold text-slate-700' : 'font-normal text-slate-300'}`}>
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
              <button
                type="button"
                disabled={!selectedRiderId}
                onClick={() => { setRiderProfileOpen(true); setSheetOpen(true); }}
                className={`w-10 h-10 flex items-center justify-center rounded-xl border shrink-0 transition active:scale-90 ${
                  selectedRiderId
                    ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100'
                    : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
            {university && !ridersLoading && riders.length === 0 && (
              <p className="text-xs text-slate-400 font-semibold text-center -mt-2">
                No {isPostageDelivery ? 'postage' : 'self-pickup'} riders available for this campus at the moment.
              </p>
            )}

            {/* Drop Point — read-only, set by admin for the selected rider */}
            {selectedRiderId && !isPostageDelivery && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-400">Drop Point</label>
                <div className="bg-white border border-slate-100 rounded-xl py-2.5 px-3">
                  <span className="text-xs font-semibold text-slate-700">
                    {riders.find(r => r.id === selectedRiderId)?.jubah_drop_point || 'Not set yet — contact admin'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── DELIVERY ADDRESS (postage or deposit+postage) ── */}
          {isPostageDelivery && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700">Delivery Address <span className="text-danger">*</span></h3>
              {fullAddress ? (
                <button type="button" onClick={openAddressSheet}
                  className="w-full text-left bg-white border border-slate-100 rounded-xl px-3 py-3 flex items-start justify-between gap-2 active:bg-slate-50 transition">
                  <pre className="text-xs font-semibold text-slate-700 whitespace-pre-wrap font-sans flex-1">{fullAddress}</pre>
                  <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                </button>
              ) : (
                <button type="button" onClick={openAddressSheet}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition active:scale-[0.99]">
                  <MapPin className="w-4 h-4" />
                  <span className="text-xs font-semibold">Tap to enter delivery address</span>
                </button>
              )}
            </div>
          )}

          {/* Hidden sample image probes — detect which fields have admin-uploaded samples */}
          <div className="hidden">
            {docFields.map(f => sampleUrls[f.id] && (
              <img key={f.id} src={sampleUrls[f.id]}
                onLoad={() => setSampleLoaded(prev => ({ ...prev, [f.id]: true }))}
                onError={() => setSampleLoaded(prev => ({ ...prev, [f.id]: false }))}
              />
            ))}
          </div>

          {/* ── DOCUMENT UPLOAD — dynamic from jubah_doc_fields ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Upload Documents</h3>

            {docFields.map(field => {
              const file = docFiles[field.id] ?? null;
              return (
                <div key={field.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <label className="flex-1 text-xs font-semibold text-slate-400">
                      {field.label} <span className="text-danger">*</span>
                    </label>
                    <button type="button"
                      onClick={() => sampleLoaded[field.id] ? setSamplePreview(sampleUrls[field.id]) : setFileError(`No sample uploaded for ${field.label} yet.`)}
                      className={`w-6 h-6 flex items-center justify-center rounded-lg transition shrink-0 active:scale-90 ${sampleLoaded[field.id] ? 'text-blue-400' : 'text-slate-300'}`}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {field.hint && <p className="text-xs text-slate-400 -mt-0.5">{field.hint}</p>}
                  <input
                    type="file"
                    accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.jpg,.png"
                    ref={el => { docRefs.current[field.id] = el; }}
                    onChange={e => handleFileSelect(e, field.id)}
                    className="hidden"
                  />
                  {!file ? (
                    <button type="button" onClick={() => docRefs.current[field.id]?.click()}
                      className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer">
                      <Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload {field.label}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                      <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-emerald-700 truncate">{file.name}</p>
                        <p className="text-xs text-emerald-500">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button type="button"
                        onClick={() => { setDocFiles(prev => ({ ...prev, [field.id]: null })); setCombinedBlob(null); if (docRefs.current[field.id]) docRefs.current[field.id]!.value = ''; }}
                        className="text-slate-400 hover:text-danger transition shrink-0 cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {fileError && (
              <p className="text-xs text-danger font-semibold flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> {fileError}
              </p>
            )}
          </div>

          {/* ── COMBINED DOCUMENT ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">Combined Document</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Once all documents are uploaded, generate a single combined PDF to download and review.
            </p>
            {!allFilesReady ? (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-300">
                <FileText className="w-5 h-5" />
                <span className="text-xs font-semibold">Upload all {docFields.length} documents above first</span>
              </div>
            ) : combining ? (
              <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
                <span className="text-xs font-semibold">Combining documents…</span>
              </div>
            ) : combinedBlob ? (
              <button type="button" onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs font-semibold py-3 rounded-xl shadow-md shadow-emerald-500/20 transition cursor-pointer">
                <Download className="w-4 h-4" />
                Download Combined PDF
              </button>
            ) : (
              <button type="button" onClick={handleCombine}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-semibold py-3 rounded-xl shadow-md shadow-blue-500/20 transition cursor-pointer">
                <FileText className="w-4 h-4" />
                Generate Combined PDF
              </button>
            )}
          </div>

          {/* ── PROOF OF PAYMENT ── */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-700">
              {paymentMode === 'deposit' ? `Proof of Deposit (RM${DEPOSIT_AMOUNT})` : 'Proof of Payment'}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
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
                <span className="text-xs font-semibold">Upload Receipt</span>
                <span className="text-xs">PDF · JPG · PNG accepted</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 truncate">{paymentProof.name}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">{(paymentProof.size / 1024).toFixed(1)} KB</p>
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
            <span className="text-xs text-blue-100 font-extrabold uppercase tracking-widest">Your Reference Number</span>
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
            <p className="text-xs text-blue-100 font-semibold mt-1">
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
          <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs text-blue-500 font-extrabold uppercase tracking-wider">Reservation Active</span>
                <h3 className="text-sm font-black text-slate-800 mt-0.5">{jubahBooking.fullName}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {jubahBooking.remark} · {jubahBooking.faculty} · {jubahBooking.matricId}
                </p>
              </div>
              <button onClick={cancelJubahBooking} className="text-xs text-slate-400 hover:text-danger font-bold flex items-center gap-0.5 shrink-0">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-slate-100 rounded-xl p-2.5">
                <span className="text-slate-400 font-semibold block text-[10px]">Service Fee</span>
                <span className="font-black text-slate-700">RM{jubahBooking.cost.toFixed(2)}</span>
                <span className="text-slate-400 block">
                  {jubahBooking.paymentMode === 'postage' ? 'Postage' : jubahBooking.paymentMode === 'deposit' ? 'Deposit' : 'Pickup'}
                  {jubahBooking.paymentMode === 'deposit' && jubahBooking.balanceDue > 0 && (
                    <span className="ml-1 text-amber-600 font-bold">(RM{jubahBooking.balanceDue} due 1 day before collection)</span>
                  )}
                </span>
              </div>
              <div className="border border-slate-100 rounded-xl p-2.5">
                <span className="text-slate-400 font-semibold block text-[10px]">Document</span>
                <span className="font-bold text-slate-700 truncate block">{jubahBooking.combinedFileName || '—'}</span>
              </div>
            </div>

            {/* Rider contact — only once assigned */}
            {liveRiderName && (
              <div className="border border-slate-100 rounded-xl p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider block">Your Rider</span>
                  <span className="text-sm font-bold text-slate-800">{liveRiderName}</span>
                  {liveRiderPhone && <span className="text-xs font-semibold text-slate-500 block">{liveRiderPhone}</span>}
                </div>
                {liveRiderPhone && (
                  <a href={`https://wa.me/${toWa(liveRiderPhone)}?text=${encodeURIComponent(
                    `Hello ${liveRiderName}, saya ${jubahBooking.fullName} (${jubahBooking.reference}). Saya ingin bertanya mengenai tempahan jubah saya.`
                  )}`} target="_blank" rel="noopener noreferrer"
                    className="text-[#25D366] active:scale-90 transition shrink-0">
                    <WaIcon className="w-5 h-5" />
                  </a>
                )}
              </div>
            )}

            {/* Save as PDF */}
            <button
              type="button"
              onClick={generateJubahPdf}
              className="w-full flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 bg-slate-50 font-semibold text-xs py-2 rounded-xl transition active:scale-[0.98] active:bg-slate-100"
            >
              <FileDown className="w-3.5 h-3.5" />
              Save as PDF
            </button>

            {/* Progress steps — wired to real DB status */}
            <h4 className="text-sm font-semibold text-slate-700">Robe Preparation</h4>
            <div className="flex flex-col gap-4 pl-2">
              {(() => {
                const isPostage = jubahBooking.paymentMode === 'postage';
                const steps = isPostage ? [
                  { key: 'booked',     label: 'Order Confirmed',   desc: 'Booking registered in system.' },
                  { key: 'processing', label: 'Processing',         desc: 'Robe being prepared for delivery.' },
                  { key: 'collected',  label: 'Collected',           desc: 'Robe collected from university.' },
                  { key: 'at_hub',     label: 'Out for Delivery',   desc: 'Arrived at postage hub.' },
                  { key: 'delivered',  label: 'Delivered',           desc: 'Safe in your hands!' },
                ] : [
                  { key: 'booked',     label: 'Order Confirmed',   desc: 'Booking registered in system.' },
                  { key: 'processing', label: 'Processing',         desc: 'Robe being prepared for collection.' },
                  { key: 'collected',  label: 'Ready for Pickup',   desc: 'Available at collection counter.' },
                  { key: 'delivered',  label: 'Collected',           desc: 'Safe in your hands!' },
                ];
                const currentStatus = liveStatus ?? 'booked';
                const currentIdx = steps.findIndex(s => s.key === currentStatus);
                return steps.map((step, idx) => {
                  const isPast    = currentIdx >= idx;
                  const isCurrent = currentIdx === idx;
                  return (
                    <div key={step.key} className="flex gap-4 relative">
                      {idx < steps.length - 1 && (
                        <div className={`absolute left-2.5 top-6 bottom-0 w-0.5 -translate-x-1/2 ${currentIdx > idx ? 'bg-blue-500' : 'bg-slate-100'}`} />
                      )}
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center relative z-10 transition ${isPast ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200'}`}>
                        {isPast && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 -mt-0.5">
                        <h5 className={`text-xs font-bold leading-tight ${isCurrent ? 'text-blue-600 font-black' : isPast ? 'text-slate-700' : 'text-slate-300'}`}>
                          {step.label}
                        </h5>
                        <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

        </div>
      )}

      {/* ── ADDRESS BOTTOM SHEET ── */}
      {showAddressSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={closeAddressSheet}>
          <div className="w-full max-w-[480px] max-h-[calc(100dvh-3rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
              <p className="text-sm font-semibold text-slate-800">Delivery Address</p>
              <button onClick={closeAddressSheet}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-2 flex flex-col gap-4">
              {[
                { label: 'Address Line 1', placeholder: 'No. 44, Jalan Desa Melur 4/1,', value: draftLine1, set: setDraftLine1 },
                { label: 'Address Line 2', placeholder: 'Taman Bandar Connaught,', value: draftLine2, set: setDraftLine2 },
                { label: 'Postal Code / City', placeholder: '56000 Cheras,', value: draftPostal, set: setDraftPostal },
                { label: 'State / Country', placeholder: 'Kuala Lumpur, Malaysia.', value: draftState, set: setDraftState },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    style={{ fontSize: '12px' }}
                    className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-700 focus:outline-none focus:border-blue-500 transition placeholder:font-normal placeholder:text-slate-300"
                  />
                </div>
              ))}
            </div>

            <div className="px-5 pt-3 shrink-0 border-t border-slate-100"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
              <button
                type="button"
                onClick={saveAddress}
                disabled={!draftLine1.trim() || !draftPostal.trim() || !draftState.trim()}
                className="w-full bg-primary text-white font-semibold text-xs py-3.5 rounded-2xl active:scale-[0.98] transition disabled:opacity-50"
              >
                Save Address
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

    {/* Sample image preview modal */}
    {samplePreview && (
      <>
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setSamplePreview(null)}>
          <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <img src={samplePreview} alt="Sample document" className="w-full rounded-2xl object-contain max-h-[70dvh]" />
            <button onClick={() => setSamplePreview(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    )}

    {/* Rider profile sheet — outside scroll container so fixed positioning works correctly */}
    {riderProfileOpen && (() => {
      const r = riders.find(rd => rd.id === selectedRiderId);
      if (!r) return null;
      const close = () => { setRiderProfileOpen(false); setSheetOpen(false); };
      return (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={close} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[calc(100dvh-3rem)] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <div>
                <p className="text-xs font-semibold text-slate-400">Your Rider</p>
                <h3 className="text-base font-black text-slate-800 mt-0.5">{r.name}</h3>
              </div>
              <button onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-400">Method</span>
                <span className="text-sm font-bold text-slate-800">{r.jubah_drop_point || '—'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-400">Representative Name</span>
                <span className="text-sm font-bold text-slate-800">{r.name}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-400">I/C Number</span>
                <IcMasked ic={r.ic_number} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-400">H/P Number</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{r.phone || '—'}</span>
                  {r.phone && (
                    <a
                      href={`https://wa.me/${toWa(r.phone)}?text=${encodeURIComponent(
                        `Asslammualaikum Jubah rider, saya perlukan 6 digit IC ${r.ic_number ? r.ic_number.replace(/\D/g,'').slice(0,6) + '-XX-XXXX' : 'XXXXXX-XX-XXXX'} terakhir awak untuk pengisian representative jubah ${university.includes('Pahang') ? 'UMPSA' : university.includes('UiTM') || university.includes('MARA') ? 'UiTM' : university.includes('Kelantan') ? 'UMK' : university.includes('Kebangsaan') ? 'UKM' : 'UIAM'}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#25D366] active:scale-90 transition shrink-0"
                    >
                      <WaIcon className="w-5 h-5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      );
    })()}
    </>
  );
};
