import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, X, Upload, FileText, ShieldAlert, Download, User, Pencil, MapPin, Copy, Check, Info, GraduationCap, FileUser } from 'lucide-react';
import { submitJubahToSheets } from '../lib/sheetsService';
import { JubahLanding } from '../components/JubahLanding';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompress';
import { stampWatermark } from '../lib/watermark';
import { saveOrShareBlob } from '../lib/nativeDownload';
import { FloatingMessage } from '../components/FloatingMessage';
import { RepresentativeSheet } from '../components/RepresentativeSheet';
import { ReceiptCard } from '../components/Receipt';
import { JubahBalancePayment } from '../components/JubahBalancePayment';
import { JubahQrButton } from '../components/JubahQrButton';
import { NativeSelect } from '../components/NativeSelect';
import { buildJubahReceiptRows } from '../lib/receiptRows';
import { getJubahProgress, JUBAH_STEP_LABEL } from '../lib/jubahStatus';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { copyToClipboard } from '../lib/clipboard';
import { savePendingJubahBooking, clearPendingJubahBooking } from '../lib/pendingJubahBooking';
import { formatPhone } from '../lib/format';
import { JUBAH_UNIVERSITY_MAP, deriveJubahCampus } from '../lib/jubahUniversities';

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

const MALAYSIAN_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'Wilayah Persekutuan Kuala Lumpur', 'Wilayah Persekutuan Labuan', 'Wilayah Persekutuan Putrajaya',
];

const formatIc = (val: string) => {
  const d = val.replace(/\D/g, '').slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
};

// Form draft — text fields only. Uploaded documents/payment proof are
// never persisted here (can't reliably stash File data in localStorage,
// and the user confirmed re-uploading is acceptable) and none of this
// ever touches Supabase — the only way data reaches the database is the
// normal Book flow (payment proof + Book button).
const JUBAH_DRAFT_KEY = 'gerak_jubah_form_draft';
interface JubahFormDraft {
  fullName: string; icNumber: string; hpNumber: string; email: string; university: string;
  faculty: string; matricId: string;
  paymentMode: 'pickup' | 'postage' | 'deposit';
  postageZone: 'SM' | 'SS';
  depositMethod: 'pickup' | 'postage';
  remark: typeof REMARKS[number];
  selectedRiderId: string;
  addressLine1: string; addressLine2: string; addressPostal: string; addressCity: string; addressState: string;
}
const saveFormDraft = (draft: JubahFormDraft) => {
  try { localStorage.setItem(JUBAH_DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable — skip silently */ }
};
const loadFormDraft = (): JubahFormDraft | null => {
  try {
    const raw = localStorage.getItem(JUBAH_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const clearFormDraft = () => {
  try { localStorage.removeItem(JUBAH_DRAFT_KEY); } catch { /* ignore */ }
};

export const Jubah: React.FC = () => {
  const { user, jubahBooking, bookJubah, commitJubahBooking, startNewJubahBooking, setCurrentPage, setSheetOpen, goBack, setLeaveGuard, addNotification } = useApp();

  const [landingUniversity, setLandingUniversity] = useState('');
  // Once booked, landingUniversity/form/tracking are all one page instance —
  // invisible to the app's page-history — so a single header back-tap would
  // otherwise skip straight past the Jubah landing to Dashboard. This lets
  // back correctly step Tracking -> Landing (peek) -> Dashboard instead.
  const [peekLanding, setPeekLanding] = useState(false);

  const [fullName, setFullName]       = useState('');
  const [icNumber, setIcNumber]       = useState('');
  const [hpNumber, setHpNumber]       = useState('');
  const [email, setEmail]             = useState('');
  const [university, setUniversity]   = useState('');
  const uniAbbrev = JUBAH_UNIVERSITY_MAP[landingUniversity]?.shortLabel ?? 'UMPSA';
  // Stamped onto every uploaded document (IC, OSCAR, SKPG, Konvo slip,
  // payment proof) before it ever leaves the browser — these carry IC
  // numbers, bank details and other PII, so every one of them gets the
  // same deterrent treatment, not just the IC. Baked into the individual
  // file itself (not just the combined PDF), so it's there regardless of
  // which one an admin/rider actually opens.
  const jubahWatermarkText = `UNTUK KEGUNAAN MAJLIS KONVOKESYEN ${uniAbbrev} SAHAJA`;
  const [faculty, setFaculty]         = useState('');
  const [matricId, setMatricId]       = useState('');
  const [paymentMode, setPaymentMode]   = useState<'pickup' | 'postage' | 'deposit'>('pickup');
  const [postageZone, setPostageZone]   = useState<'SM' | 'SS'>('SM');
  const [depositMethod, setDepositMethod] = useState<'pickup' | 'postage'>('pickup');
  const [remark, setRemark]           = useState<typeof REMARKS[number]>('Degree');
  type JubahDocField = { id: string; field_key: string; label: string; hint: string | null; position: number };
  const FALLBACK_DOC_FIELDS: JubahDocField[] = [
    { id: 'oscar', field_key: 'oscar', label: 'OSCAR',             hint: null,                                   position: 1 },
    { id: 'skpg',  field_key: 'skpg',  label: 'SKPG',              hint: null,                                   position: 2 },
    { id: 'konvo', field_key: 'konvo', label: 'Konvo Slip',         hint: null,                                   position: 3 },
    { id: 'ic',    field_key: 'ic',    label: 'IC (Front & Back)',  hint: 'Accepts PDF or image (JPG/PNG)',       position: 4 },
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
  const [riders,            setRiders]            = useState<{
    id: string; name: string; jubah_drop_point: string | null; ic_number: string | null; phone: string | null;
  }[]>([]);
  const [bankDetails,       setBankDetails]       = useState<{ name: string; account: string; holder: string } | null>(null);
  const [ridersLoading,     setRidersLoading]     = useState(false);
  const [riderProfileOpen,  setRiderProfileOpen]  = useState(false);

  // Address state — only used for postage mode
  const [addressLine1,      setAddressLine1]      = useState('');
  const [addressLine2,      setAddressLine2]      = useState('');
  const [addressPostal,     setAddressPostal]     = useState('');
  const [addressCity,       setAddressCity]       = useState('');
  const [addressState,      setAddressState]      = useState('');
  const [showAddressSheet,  setShowAddressSheet]  = useState(false);
  // Draft state inside the address sheet
  const [draftLine1,        setDraftLine1]        = useState('');
  const [draftLine2,        setDraftLine2]        = useState('');
  const [draftPostal,       setDraftPostal]       = useState('');
  const [draftCity,         setDraftCity]         = useState('');
  const [draftState,        setDraftState]        = useState('');

  const fullAddress = [
    addressLine1,
    addressLine2,
    [addressPostal, addressCity].filter(Boolean).join(' '),
    addressState ? `${addressState}, Malaysia` : '',
  ].filter(Boolean).join('\n');

  const openAddressSheet = () => {
    setDraftLine1(addressLine1); setDraftLine2(addressLine2);
    setDraftPostal(addressPostal); setDraftCity(addressCity); setDraftState(addressState);
    setShowAddressSheet(true);
  };
  const saveAddress = () => {
    setAddressLine1(draftLine1.trim()); setAddressLine2(draftLine2.trim());
    setAddressPostal(draftPostal.trim()); setAddressCity(draftCity.trim()); setAddressState(draftState);
    setShowAddressSheet(false);
  };
  const closeAddressSheet = () => { setShowAddressSheet(false); };

  // Report to AppContext whenever a sheet here is open, so BottomNav hides
  // itself. Driven by state (not called inline at each open/close site) so
  // it stays paired 1:1 even if the sheet unmounts some other way.
  useEffect(() => {
    const anyOpen = showAddressSheet || riderProfileOpen;
    if (!anyOpen) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [showAddressSheet, riderProfileOpen, setSheetOpen]);

  // Silently restore a saved draft on mount — same behaviour as returning
  // to an unsubmitted Google Form: no extra prompt, fields just reappear.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    const d = loadFormDraft();
    if (!d) return;
    draftRestoredRef.current = true;
    queueMicrotask(() => {
      setFullName(d.fullName ?? '');
      setIcNumber(d.icNumber ?? '');
      setHpNumber(d.hpNumber ?? '');
      setEmail(d.email ?? '');
      setUniversity(d.university ?? '');
      setFaculty(d.faculty ?? '');
      setMatricId(d.matricId ?? '');
      if (['pickup', 'postage', 'deposit'].includes(d.paymentMode)) setPaymentMode(d.paymentMode);
      if (['SM', 'SS'].includes(d.postageZone)) setPostageZone(d.postageZone);
      if (['pickup', 'postage'].includes(d.depositMethod)) setDepositMethod(d.depositMethod);
      if (REMARKS.includes(d.remark)) setRemark(d.remark);
      setSelectedRiderId(d.selectedRiderId ?? '');
      setAddressLine1(d.addressLine1 ?? '');
      setAddressLine2(d.addressLine2 ?? '');
      setAddressPostal(d.addressPostal ?? '');
      setAddressCity(d.addressCity ?? '');
      setAddressState(d.addressState ?? '');
      if (d.university) setLandingUniversity('umpsa');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-save — the explicit "Save Draft" button (on the
  // back-navigation confirm dialog) only fires when the user leaves through
  // an in-app control. Confirmed live on Android: switching to another app
  // (e.g. Files, to check a downloaded PDF) doesn't go through that at all —
  // the OS can simply kill the backgrounded process outright (common under
  // memory pressure, easy to hit on an emulator), and relaunching is a full
  // WebView reload with nothing ever having been saved. Auto-saving on every
  // change closes that gap regardless of how/why the process gets killed,
  // rather than depending on a specific navigation path.
  useEffect(() => {
    if (!fullName.trim() && !icNumber.trim() && !hpNumber.trim() && !matricId.trim()) return;
    const id = setTimeout(() => {
      saveFormDraft({
        fullName, icNumber, hpNumber, email, university, faculty, matricId,
        paymentMode, postageZone, depositMethod, remark, selectedRiderId,
        addressLine1, addressLine2, addressPostal, addressCity, addressState,
      });
    }, 500);
    return () => clearTimeout(id);
  }, [
    fullName, icNumber, hpNumber, email, university, faculty, matricId,
    paymentMode, postageZone, depositMethod, remark, selectedRiderId,
    addressLine1, addressLine2, addressPostal, addressCity, addressState,
  ]);

  // Logged-in users get Full Name / IC / Phone / Matric ID pre-filled from
  // their profile — still fully editable, just saves re-typing what we
  // already know. Guests get a blank form, as before. A restored draft
  // (the user's own prior edits) always wins over a fresh profile pre-fill.
  // Functional setState (prev => prev || value) makes this safe to re-run
  // as user data streams in after login, without ever overwriting anything
  // the user (or the draft restore above) already put in the field.
  useEffect(() => {
    if (draftRestoredRef.current || !user.isLoggedIn) return;
    queueMicrotask(() => {
      if (user.name)     setFullName(prev => prev || user.name);
      if (user.icNumber) setIcNumber(prev => prev || formatIc(user.icNumber));
      if (user.phone)    setHpNumber(prev => prev || formatPhone(user.phone));
      if (user.matricNo) setMatricId(prev => prev || user.matricNo);
      if (user.email)    setEmail(prev => prev || user.email);
    });
  }, [user.isLoggedIn, user.name, user.icNumber, user.phone, user.matricNo, user.email]);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Content-based, not edit-based — a profile-prefilled field counts the
  // same as a hand-typed one, since either way the form isn't blank.
  const hasUnsavedInput = !!(
    fullName.trim() || icNumber.trim() || hpNumber.trim() || matricId.trim() ||
    Object.values(docFiles).some(f => !!f) || paymentProof
  );

  // Registers with AppContext's goBack() so leaving the actual form (header
  // back button, hardware back, or the edge-swipe gesture — all three call
  // the exact same shared goBack()) is a two-step chain instead of jumping
  // straight past the university picker to wherever the user came from:
  // Form -> (back) -> University picker -> (back) -> real page history.
  // Only the FIRST back-tap (landingUniversity still set) is intercepted;
  // once it resets to '' the guard releases, so the next back-tap falls
  // through to normal goBack() and actually leaves Jubah.
  //
  // If there's unsaved input, the first back-tap shows the discard-confirm
  // dialog instead (unchanged) — "Discard"/"Save Draft" still leave Jubah
  // directly, since the user already explicitly chose to leave there.
  //
  // Once booked (jubahBooking truthy), repurposed for the same two-step
  // chain: Tracking -> (back) -> Landing peek -> (back) -> Dashboard.
  useEffect(() => {
    if (jubahBooking) {
      setLeaveGuard(peekLanding ? null : () => () => setPeekLanding(true));
      return () => setLeaveGuard(null);
    }
    if (!landingUniversity) { setLeaveGuard(null); return; }
    setLeaveGuard(() => (hasUnsavedInput ? () => setShowLeaveConfirm(true) : () => setLandingUniversity('')));
    return () => setLeaveGuard(null);
  }, [hasUnsavedInput, jubahBooking, landingUniversity, peekLanding, setLeaveGuard]);

  const handleDiscardLeave = () => {
    clearFormDraft();
    setLeaveGuard(null);
    setShowLeaveConfirm(false);
    goBack();
  };
  const handleSaveDraftLeave = () => {
    saveFormDraft({
      fullName, icNumber, hpNumber, email, university, faculty, matricId,
      paymentMode, postageZone, depositMethod, remark, selectedRiderId,
      addressLine1, addressLine2, addressPostal, addressCity, addressState,
    });
    setLeaveGuard(null);
    setShowLeaveConfirm(false);
    goBack();
  };
  const handleContinueEditing = () => setShowLeaveConfirm(false);

  // Pricing state — fetched from jubah_pricing table, kept live via Realtime
  type PricingMap = Record<string, Record<string, number>>; // remark -> mode -> price
  const [pricing, setPricing] = useState<PricingMap>({});
  useEffect(() => {
    const fetchPricing = () =>
      supabase.rpc('get_jubah_pricing').then(({ data }) => {
        if (data) {
          const map: PricingMap = {};
          // get_jubah_pricing returns every university's rows in one list
          // (same remark+payment_mode repeated once per university) — must
          // filter to this booking's own university before building the
          // map, otherwise whichever university's row happens to come last
          // silently overwrites the one that's actually relevant here.
          (data as { remark: string; payment_mode: string; price: number; university: string }[])
            .filter(r => r.university === landingUniversity)
            .forEach(r => {
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
  }, [landingUniversity]);

  const DEPOSIT_AMOUNT    = 25;
  const pickupPrice       = pricing[remark]?.['pickup']  ?? 70;
  const postagePrice      = pricing[remark]?.['postage'] ?? 90;
  const isPostageDelivery = paymentMode === 'postage' || (paymentMode === 'deposit' && depositMethod === 'postage');
  const ssCharge          = isPostageDelivery && postageZone === 'SS' ? 10 : 0;
  // Deposit's own balance estimate, shown in its option label regardless of
  // which payment mode is currently selected (independent of ssCharge/
  // isPostageDelivery above, which are gated to the selected mode).
  const depositBalancePreview = (depositMethod === 'postage'
    ? postagePrice + (postageZone === 'SS' ? 10 : 0)
    : pickupPrice) - DEPOSIT_AMOUNT;
  const cost = paymentMode === 'deposit' ? DEPOSIT_AMOUNT : paymentMode === 'postage' ? postagePrice + ssCharge : pickupPrice;

  // Fetch active riders whenever campus or service option (Pickup/Postage) changes
  useEffect(() => {
    if (!university) {
      queueMicrotask(() => {
        setRiders([]);
        setSelectedRiderId('');
      });
      return;
    }
    const campus = deriveJubahCampus(landingUniversity, university);
    queueMicrotask(() => {
      setRidersLoading(true);
      setSelectedRiderId('');
    });
    supabase
      .rpc('get_active_jubah_riders', { p_campus: campus, p_method: paymentMode === 'deposit' ? depositMethod : paymentMode })
      .then(({ data }) => { setRiders(data ?? []); setRidersLoading(false); });
  }, [university, paymentMode, depositMethod, landingUniversity]);

  // Shared Jubah bank account — one account for every rider/customer, set by
  // superadmin (JubahPriceSubTab.tsx). Public read, same as jubah_active.
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['jubah_bank_name', 'jubah_bank_account_number', 'jubah_bank_account_holder'])
      .then(({ data }) => {
        const name   = data?.find(r => r.key === 'jubah_bank_name')?.value;
        const account = data?.find(r => r.key === 'jubah_bank_account_number')?.value;
        const holder  = data?.find(r => r.key === 'jubah_bank_account_holder')?.value;
        if (name && account && holder) setBankDetails({ name, account, holder });
      });
  }, []);

  // Load doc fields for the selected university; fall back to UMPSA then hardcoded defaults
  useEffect(() => {
    if (!landingUniversity) return;
    queueMicrotask(() => {
      setDocFiles({});
      setCombinedBlob(null);
      setSampleLoaded({});
      load();
    });

    const applyFields = (fields: JubahDocField[], univKey: string) => {
      setDocFields(fields);
      const urls: Record<string, string> = {};
      fields.forEach(f => {
        // No cache-busting param here on purpose — these are static
        // reference images admin uploads rarely, and this runs on every
        // customer's visit to the booking form. Busting on every load (the
        // old behavior) meant every single customer re-downloaded every
        // sample image every time, defeating browser/CDN caching entirely
        // for what should be near-immutable content. Admin's own upload
        // preview (AdminHome.tsx's sampleUrls) still busts on its own —
        // that's a separate, low-traffic management view where seeing the
        // just-uploaded file immediately actually matters.
        const { data } = supabase.storage.from('jubah-banners').getPublicUrl(`samples/${univKey}/${f.field_key}.jpg`);
        urls[f.id] = data.publicUrl;
      });
      setSampleUrls(urls);
    };

    const load = async () => {
      const { data } = await supabase
        .from('jubah_doc_fields')
        .select('id, field_key, label, hint, position')
        .eq('university_key', landingUniversity)
        .order('position');
      if (data && data.length > 0) { applyFields(data, landingUniversity); return; }
      const { data: defaults } = await supabase
        .from('jubah_doc_fields')
        .select('id, field_key, label, hint, position')
        .eq('university_key', 'umpsa')
        .order('position');
      if (defaults && defaults.length > 0) { applyFields(defaults, 'umpsa'); return; }
      applyFields(FALLBACK_DOC_FIELDS, 'umpsa');
    };
  }, [landingUniversity]);

  const allFilesReady = docFields.length > 0 && docFields.every(f => !!docFiles[f.id]);

  const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, fieldId: string) => {
    const file = e.target.files?.[0] || null;
    setFileError('');
    setCombinedBlob(null);
    if (file && !ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Only PDF, JPG or PNG files are accepted.');
      return;
    }
    const compressed = file ? await compressImage(file) : null;
    // Only the IC gets watermarked, not OSCAR/SKPG/Konvo — those don't carry
    // the same identity-document risk. field_key (not fieldId, which is a
    // DB id for university-specific field sets) is what actually says "ic".
    const isIc = docFields.find(f => f.id === fieldId)?.field_key === 'ic';
    let stamped = compressed;
    if (compressed && isIc) {
      try { stamped = await stampWatermark(compressed, jubahWatermarkText); }
      catch (err) { console.error('[GERAK] Watermark failed, uploading original file:', err); }
    }
    setDocFiles(prev => ({ ...prev, [fieldId]: stamped }));
  };

  const generateCombinedBlob = async (): Promise<Blob | null> => {
    const entries = docFields.map(f => ({ field: f, file: docFiles[f.id] ?? null }));
    if (entries.some(e => !e.file)) return null;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const merged = await PDFDocument.create();

      // No watermarking here anymore — every file in docFiles was already
      // stamped by handleFileSelect before it got this far, so merging them
      // carries the watermark through automatically. Stamping again here on
      // top of an already-watermarked IC page would double it up.
      const addFile = async ({ file: f }: { field: JubahDocField; file: File | null }) => {
        if (!f) return;
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
      for (const entry of entries) await addFile(entry);
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
    saveOrShareBlob(combinedBlob, `${(fullName || 'combined').replace(/\s+/g, '_')}.pdf`);
  };

  const [booking, setBooking] = useState(false);
  const [copied, setCopied]   = useState(false);

  // Live status polled from DB (replaces the demo simulation)
  const [liveStatus,        setLiveStatus]        = useState<string | null>(null);
  const [liveRiderName,     setLiveRiderName]      = useState<string | null>(null);
  const [liveRiderPhone,    setLiveRiderPhone]     = useState<string | null>(null);
  const [liveBalancePaid,   setLiveBalancePaid]    = useState(false);
  const [liveBalancePaidAt, setLiveBalancePaidAt]  = useState<string | null>(null);
  const [liveInitialPaid,   setLiveInitialPaid]    = useState(false);
  const [liveInitialPaidAt, setLiveInitialPaidAt]  = useState<string | null>(null);
  const [liveBalanceProofUrl, setLiveBalanceProofUrl] = useState<string | null>(null);

  // Notify on real status changes only — mirrors the same prev-vs-current
  // ref-diff pattern MyOrders.tsx already uses for ride status, so this
  // fires "Robe Processing" / "Robe Collected" / etc as they actually
  // happen while this page is open, instead of never notifying at all for
  // status changes a rider or admin makes independently.
  const prevLiveStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jubahBooking?.reference) return;
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase
        .rpc('get_jubah_booking_live_status', { p_reference: jubahBooking.reference, p_hp_number: jubahBooking.hpNumber })
        .single<{ status: string; rider_name: string | null; rider_phone: string | null; balance_paid: boolean | null; balance_paid_at: string | null; initial_paid: boolean | null; initial_paid_at: string | null; balance_proof_url: string | null }>();
      if (data && !cancelled) {
        if (prevLiveStatusRef.current !== null && prevLiveStatusRef.current !== data.status) {
          addNotification(
            'Jubah Order Updated',
            `${jubahBooking.reference} is now: ${JUBAH_STEP_LABEL[data.status] ?? data.status}.`,
            'jubah',
          );
        }
        prevLiveStatusRef.current = data.status;
        setLiveStatus(data.status);
        setLiveRiderName(data.rider_name ?? null);
        setLiveRiderPhone(data.rider_phone ?? null);
        setLiveBalancePaid(data.balance_paid ?? false);
        setLiveBalancePaidAt(data.balance_paid_at ?? null);
        setLiveInitialPaid(data.initial_paid ?? false);
        setLiveInitialPaidAt(data.initial_paid_at ?? null);
        setLiveBalanceProofUrl(data.balance_proof_url ?? null);
      }
    };
    poll();
    // 60s, not 30s — this polls a shared rate-limit budget
    // (check_jubah_rate_limit) alongside every other guest-facing Jubah
    // RPC; halving the background poll rate here matters more at real
    // intake volume (many guests with this page open) than the extra
    // latency on picking up a status change costs.
    const id = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [jubahBooking?.reference]);

  // Leaves the current booking untouched in the database — just clears it
  // from this browser and resets the form so a genuinely new booking can be
  // started, instead of silently re-submitting the previous one's fields
  // and already-selected documents.
  const handleBookAnother = () => {
    clearPendingJubahBooking();
    startNewJubahBooking();
    setFullName(''); setIcNumber(''); setHpNumber(''); setEmail('');
    setUniversity(''); setFaculty(''); setMatricId('');
    setPaymentMode('pickup'); setPostageZone('SM'); setDepositMethod('pickup');
    setRemark('Degree');
    setDocFiles({}); setCombinedBlob(null);
    setPaymentProof(null); if (paymentProofRef.current) paymentProofRef.current.value = '';
    setSelectedRiderId('');
    setAddressLine1(''); setAddressLine2(''); setAddressPostal(''); setAddressCity(''); setAddressState('');
    setFileError('');
  };

  const handleBook = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!university) { alert('Please select your university.'); return; }
    if (!faculty) { alert('Please select your faculty.'); return; }
    if (!email.trim()) { alert('Please enter your email.'); return; }
    if (!selectedRiderId) { alert('Please select a rider.'); return; }
    if (isPostageDelivery && !fullAddress) { alert('Please enter your delivery address.'); return; }
    if (!allFilesReady) { setFileError('Please upload all required documents.'); return; }
    if (!paymentProof) { setFileError('Please upload your proof of payment.'); return; }

    const generateReference = () => `JUB-${new Date().getFullYear().toString().slice(-2)}-${uniAbbrev}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    let reference = generateReference();
    const combinedFileName = `${(fullName || 'combined').replace(/\s+/g, '_')}_combined.pdf`;
    const selectedRider = riders.find(r => r.id === selectedRiderId);
    const bookingCampus = deriveJubahCampus(landingUniversity, university);
    const zonePrefix = postageZone === 'SS' ? '[SS - Sabah & Sarawak]\n' : '';
    const addr = isPostageDelivery ? `${zonePrefix}${fullAddress}` : undefined;

    setBooking(true);
    let docsPath: string | undefined;
    let paymentPath: string | undefined;
    let oscarPath: string | undefined;
    let skpgPath: string | undefined;
    let konvoPath: string | undefined;
    let icPath: string | undefined;
    let docUploads: (string | undefined)[] = [];

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
      docUploads = await Promise.all(
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
      // Routed by field_key, not array position — a university's doc field
      // set can differ in count/order from UMPSA's (e.g. UKM has no 'oscar'
      // field at all), so positional docUploads[0]/[1]/[2]/[3] would
      // silently file uploads into the wrong DB column once that stopped
      // being true.
      const uploadsByKey: Record<string, string | undefined> = {};
      docFields.forEach((f, i) => { uploadsByKey[f.field_key] = docUploads[i]; });
      oscarPath = uploadsByKey.oscar;
      skpgPath  = uploadsByKey.skpg;
      konvoPath = uploadsByKey.konvo;
      icPath    = uploadsByKey.ic;
    } catch (err) {
      console.error('[GERAK] Storage upload failed:', err);
    }

    let result = await bookJubah(reference, fullName, icNumber, hpNumber, university, faculty, matricId, paymentMode, remark, combinedFileName, depositMethod, postageZone, selectedRiderId, selectedRider?.name, bookingCampus, addr, docsPath, oscarPath, skpgPath, konvoPath, icPath, landingUniversity, email, paymentPath);

    // The reference is a short client-generated random string — vanishingly
    // unlikely to collide with another booking, but not impossible at scale.
    // Retry once with a fresh one rather than surfacing the raw DB error;
    // already-uploaded files stay valid since their paths are stored as-is,
    // independent of this label. Checked via a stable error code, not the
    // raw Postgres message text — create_jubah_booking no longer returns
    // that verbatim (see migration_jubah_booking_generic_errors.sql).
    if (!result.success && result.code === 'duplicate_reference') {
      reference = generateReference();
      result = await bookJubah(reference, fullName, icNumber, hpNumber, university, faculty, matricId, paymentMode, remark, combinedFileName, depositMethod, postageZone, selectedRiderId, selectedRider?.name, bookingCampus, addr, docsPath, oscarPath, skpgPath, konvoPath, icPath, landingUniversity, email, paymentPath);
    }

    if (!result.success) {
      setBooking(false);
      setFileError(result.error ?? 'Booking failed to save. Please try again.');
      return;
    }
    clearFormDraft();

    // Saved now, so that if the customer closes the tab right after booking,
    // the app can still point them back at this booking next time they open
    // it — see JubahLanding's "unfinished booking" prompt.
    savePendingJubahBooking(reference, hpNumber);

    // Sheet gets every document labelled by its real field label — lossless
    // regardless of how many doc fields this university has configured,
    // unlike the three fixed oscar/skpg/konvo/ic slots above (those stay as
    // named DB columns; the sheet has no such fixed schema to respect).
    const documents = [
      ...docFields.map((f, i) => ({ label: f.label, path: docUploads[i] ?? '' })),
      { label: 'Combined PDF',  path: docsPath ?? '' },
      { label: 'Payment Proof', path: paymentPath ?? '' },
    ].filter(d => d.path);

    submitJubahToSheets({
      reference, fullName, icNumber, hpNumber, university, faculty, matricId,
      paymentMode,
      depositMethod: paymentMode === 'deposit' ? depositMethod : undefined,
      postageZone: isPostageDelivery ? postageZone : undefined,
      remark, cost,
      deliveryAddress: addr,
      riderName: selectedRider?.name,
      documents,
    });

    // Payment is a screenshot uploaded alongside everything else above, not
    // a redirect — the booking is fully submitted and awaiting admin review
    // the moment this call returns, so the Reservation Active view can show
    // immediately.
    setBooking(false);
    commitJubahBooking(result.booking!);
  };

  if (peekLanding || (!jubahBooking && !landingUniversity)) {
    return <JubahLanding onProceed={u => { setPeekLanding(false); setLandingUniversity(u); }} />;
  }

  // Universities not yet configured for booking (see JUBAH_UNIVERSITIES' `live` flag)
  if (!jubahBooking && !JUBAH_UNIVERSITY_MAP[landingUniversity]?.live) {
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
              {JUBAH_UNIVERSITY_MAP[landingUniversity]?.fullName}
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
        <h2 className="text-xl font-semibold m-0 text-slate-800 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-slate-400" /> Jubah Delivery
        </h2>
        <p className="text-xs text-slate-400 font-normal mt-0.5">
          {JUBAH_UNIVERSITY_MAP[landingUniversity]?.fullName} · Official Robe Bookings
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
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
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
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
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
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400">
                Email <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
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
                className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
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
              <NativeSelect
                value={university}
                onChange={u => { setUniversity(u); setFaculty(''); }}
                options={UNIVERSITIES.map(u => ({ value: u, label: u.includes('Pekan') ? 'UMPSA Pekan' : 'UMPSA Gambang' }))}
                placeholder="Select your campus..."
                label="Select Campus"
              />
            </div>

            {/* Faculty — list changes based on selected university */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">
                Faculty <span className="text-danger">*</span>
              </label>
              <NativeSelect
                value={faculty}
                onChange={setFaculty}
                options={(UNIVERSITY_FACULTIES[university] ?? []).map(f => ({ value: f, label: f }))}
                placeholder={university ? 'Select your faculty...' : 'Select a university first'}
                label="Select Faculty"
                disabled={!university}
              />
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
                    onPointerDown={(e) => { e.preventDefault(); setRemark(r); }}
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
                  Deposit (RM{DEPOSIT_AMOUNT}) — Pay RM{depositBalancePreview} before robe Collection date
                </span>
                <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                  Pay RM{DEPOSIT_AMOUNT} now to secure your booking. Pay the remaining RM{depositBalancePreview} <span className="font-bold text-slate-500">1 day before collection day</span> via Track My Order. <span className="bg-yellow-200 text-slate-800 font-semibold px-1 rounded">The RM{DEPOSIT_AMOUNT} deposit is non-refundable once paid — you can cancel for free before paying it, but not after.</span>
                </span>

                {/* Sub-choices: Self Pickup or Pickup & Postage */}
                {paymentMode === 'deposit' && (
                  <div className="flex flex-col gap-1 mt-3" onClick={e => e.preventDefault()}>
                    {/* Self Pickup */}
                    <button
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); setDepositMethod('pickup'); }}
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
                      onPointerDown={(e) => { e.preventDefault(); setDepositMethod('postage'); }}
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
                            onPointerDown={(e) => { e.preventDefault(); setPostageZone(zone); }}
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
                  Full Payment (RM{pickupPrice}) — Pickup Point
                </span>
                <span className="text-xs text-slate-400 leading-relaxed block mt-0.5">
                  Service charge for pickup only at UMPSA Pekan on your scheduled date. We store, manage and maintain all items (jubah, mortarboard, kad jemputan, cenderahati &amp; selempang) until handover.
                </span>
              </div>
            </label>

            {/* Postage with SM/SS zone toggle */}
            <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${paymentMode === 'postage' ? 'border-slate-900' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="paymentMode" value="postage" checked={paymentMode === 'postage'} onChange={() => setPaymentMode('postage')} className="mt-0.5 accent-slate-900 shrink-0" />
              <div className="flex-1">
                <span className={`text-xs font-semibold block ${paymentMode === 'postage' ? 'text-slate-900' : 'text-slate-700'}`}>
                  Full Payment (RM{postagePrice + (postageZone === 'SS' ? 10 : 0)}) — Pickup &amp; Postage
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
                        onPointerDown={(e) => { e.preventDefault(); setPostageZone(zone); }}
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
              <div className="flex-1">
                <NativeSelect
                  value={selectedRiderId}
                  onChange={setSelectedRiderId}
                  options={riders.map(r => ({ value: r.id, label: r.name }))}
                  placeholder={
                    ridersLoading
                      ? 'Loading riders...'
                      : university
                        ? riders.length === 0 ? 'No riders available' : 'Select a rider...'
                        : 'Select campus first'
                  }
                  label="Select Rider"
                  disabled={!university || ridersLoading || riders.length === 0}
                />
              </div>
              <button
                type="button"
                disabled={!selectedRiderId}
                onPointerDown={e => { e.preventDefault(); setRiderProfileOpen(true); }}
                className={`w-10 h-10 flex items-center justify-center rounded-xl border shrink-0 transition-transform active:scale-90 ${
                  selectedRiderId
                    ? 'bg-white border-slate-100 text-slate-500'
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
                      <FileUser className="w-3.5 h-3.5" />
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

          {/* ── HOW TO PAY ── */}
          <div className="bg-blue-50 border border-blue-100 rounded-3xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-blue-800">How to Pay</h3>
              <JubahQrButton />
            </div>
            {bankDetails ? (
              <div className="bg-white border border-blue-100 rounded-2xl p-4 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Bank</span>
                  <span className="font-bold text-slate-800">{bankDetails.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Account No.</span>
                  <span className="font-bold text-slate-800 font-mono">{bankDetails.account}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Account Holder</span>
                  <span className="font-bold text-slate-800">{bankDetails.holder}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-blue-600">Payment details not set yet — contact admin.</p>
            )}
            <p className="text-xs text-blue-700 leading-relaxed">
              Transfer <span className="font-bold">RM{cost.toFixed(2)}</span>{paymentMode === 'deposit' && <> (RM{DEPOSIT_AMOUNT} deposit)</>} using the details above — put your <span className="font-bold">full name</span> as the transfer reference so it's easy to match. Then upload your receipt below and tap Book.
            </p>
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
              onChange={async e => {
                const file = e.target.files?.[0] || null;
                setPaymentProof(file ? await compressImage(file) : null);
              }}
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
          <div className="bg-blue-600 rounded-3xl p-5 flex flex-col gap-1 text-center">
            <span className="text-xs text-blue-100 font-extrabold uppercase tracking-widest">Your Reference Number</span>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-black text-white tracking-wider">{jubahBooking.reference}</span>
              <button
                type="button"
                onClick={async () => {
                  if (!(await copyToClipboard(jubahBooking.reference))) return;
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
                : 'Save this number — you\'ll need it to track your delivery.'}
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

          {/* Book Another — leaves this booking as-is, just starts a fresh form */}
          <button
            type="button"
            onClick={handleBookAnother}
            className="text-xs font-semibold text-slate-400 hover:text-blue-600 transition active:scale-95 self-center"
          >
            + Book Another
          </button>

          {/* Awaiting Confirmation — shown until admin reviews the uploaded proof */}
          {(liveStatus ?? jubahBooking.status) === 'ordered' && (
            <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 flex flex-col gap-1">
              <span className="text-xs text-amber-600 font-extrabold uppercase tracking-wider">Awaiting Confirmation</span>
              <p className="text-xs text-amber-700 mt-1">
                We've received your booking and payment proof — an admin will review and confirm it shortly. You'll see your status update here once confirmed.
              </p>
            </div>
          )}

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
            </div>

            {(() => {
              const jubahDoc = buildJubahReceiptRows({
                reference:    jubahBooking.reference,
                fullName:     jubahBooking.fullName,
                icNumber:     jubahBooking.icNumber,
                hpNumber:     jubahBooking.hpNumber,
                email:        jubahBooking.email,
                university:   jubahBooking.university,
                faculty:      jubahBooking.faculty,
                matricId:     jubahBooking.matricId,
                remark:       jubahBooking.remark,
                paymentMode:  jubahBooking.paymentMode,
                cost:         jubahBooking.cost,
                balanceDue:   jubahBooking.balanceDue,
                balancePaid:   liveBalancePaid,
                balancePaidAt: liveBalancePaidAt,
                deliveryAddress: jubahBooking.deliveryAddress,
                documentName: jubahBooking.combinedFileName,
                status:       liveStatus ?? jubahBooking.status,
                initialPaid:   liveInitialPaid,
                initialPaidAt: liveInitialPaidAt,
                riderName:    liveRiderName,
                riderPhone:   liveRiderPhone,
                createdAt:    null,
              });
              return <ReceiptCard doc={jubahDoc} onSavePdf={() => generateReceiptPdf(jubahDoc)} />;
            })()}

            {/* Progress steps — wired to real DB status via the shared step
                sequence (jubahStatus.ts), same source AdminHome/RiderHome/
                TrackJubah use. This used to be its own hand-rolled copy that
                never got the 'paid' status added when that bug was fixed
                everywhere else — a customer who'd just paid in full (pickup
                or postage) saw a completely blank, 0%-progress tracker right
                after paying, since findIndex returned -1 for an unrecognised
                status and -1 >= idx is false for every step. Postage orders
                also could never show "done" at all, since their real
                terminal status is 'at_hub', not 'delivered' — the old local
                array used 'delivered' for both flows. */}
            <h4 className="text-sm font-semibold text-slate-700">Robe Preparation</h4>
            <div className="flex flex-col gap-4 pl-2">
              {(() => {
                // Deposit mode's own status flow can't tell pickup vs postage
                // apart from paymentMode alone (it's literally 'deposit'
                // either way) — deliveryAddress is the same reliable signal
                // buildJubahReceiptRows uses for the same distinction.
                const isPostageDelivery = jubahBooking.paymentMode === 'postage' ||
                  (jubahBooking.paymentMode === 'deposit' && !!jubahBooking.deliveryAddress);
                const STEP_INFO: Record<string, { label: string; desc: string }> = {
                  paid:       { label: 'Payment Confirmed', desc: 'Payment received — your order is in the queue.' },
                  processing: { label: 'Processing',        desc: isPostageDelivery ? 'Robe being prepared for delivery.' : 'Robe being prepared for collection.' },
                  collected:  { label: isPostageDelivery ? 'Collected' : 'Ready for Pickup', desc: isPostageDelivery ? 'Robe collected from university.' : 'Available at collection counter.' },
                  at_hub:     { label: 'Out for Delivery',  desc: 'Arrived at postage hub.' },
                  delivered:  { label: 'Collected',         desc: 'Safe in your hands!' },
                };
                const { steps, curStep } = getJubahProgress(liveStatus ?? jubahBooking.status, jubahBooking.paymentMode);
                return steps.map((key, idx) => {
                  const info      = STEP_INFO[key];
                  const isPast    = curStep >= idx;
                  const isCurrent = curStep === idx;
                  return (
                    <div key={key} className="flex gap-4 relative">
                      {idx < steps.length - 1 && (
                        <div className={`absolute left-2.5 top-6 bottom-0 w-0.5 -translate-x-1/2 ${curStep > idx ? 'bg-blue-500' : 'bg-slate-100'}`} />
                      )}
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center relative z-10 transition ${isPast ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200'}`}>
                        {isPast && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 -mt-0.5">
                        <h5 className={`text-xs font-bold leading-tight ${isCurrent ? 'text-blue-600 font-black' : isPast ? 'text-slate-700' : 'text-slate-300'}`}>
                          {info.label}
                        </h5>
                        <p className="text-xs text-slate-400 mt-0.5">{info.desc}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Balance Due — deposit bookings only, once the initial deposit
              itself is confirmed (before that, the "Awaiting Confirmation"
              banner above already covers it). Mirrors TrackJubah.tsx's own
              "Pay Balance" section so this is payable right here without
              having to navigate to Track My Order first. */}
          {jubahBooking.paymentMode === 'deposit' &&
           (liveStatus ?? jubahBooking.status) !== 'cancelled' &&
           (liveStatus ?? jubahBooking.status) !== 'ordered' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
              <JubahBalancePayment
                reference={jubahBooking.reference}
                hpNumber={jubahBooking.hpNumber}
                fullName={jubahBooking.fullName}
                balanceDue={jubahBooking.balanceDue}
                balancePaid={liveBalancePaid}
                balanceProofUrl={liveBalanceProofUrl}
                bankDetails={bankDetails}
                onSubmitted={proof => setLiveBalanceProofUrl(proof)}
              />
            </div>
          )}

        </div>
      )}

      {/* ── ADDRESS BOTTOM SHEET ── */}
      {showAddressSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onPointerDown={(e) => { e.preventDefault(); closeAddressSheet(); }}>
          <div className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
            onPointerDown={e => e.stopPropagation()}>
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
                { label: 'Street', placeholder: 'No. 44, Jalan Desa Melur 4/1', value: draftLine1, set: setDraftLine1 },
                { label: 'Street 2 (optional)', placeholder: 'Taman Bandar Connaught', value: draftLine2, set: setDraftLine2 },
                { label: 'Postcode', placeholder: '56000', value: draftPostal, set: setDraftPostal },
                { label: 'City', placeholder: 'Cheras', value: draftCity, set: setDraftCity },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    style={{ fontSize: '12px' }}
                    className="bg-white border border-slate-100 rounded-xl py-2.5 px-3 font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
                  />
                </div>
              ))}

              {/* State — dropdown, not free text */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">State</label>
                <NativeSelect
                  value={draftState}
                  onChange={setDraftState}
                  options={MALAYSIAN_STATES.map(s => ({ value: s, label: s }))}
                  placeholder="Select state..."
                  label="Select State"
                />
              </div>

              {/* Phone — always the same number as HP Number above, not re-entered here */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Phone</label>
                <div className="bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-500">
                  {hpNumber || '—'}
                </div>
              </div>

              {/* Country/Region — fixed, Jubah delivery is domestic-only */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Country/Region</label>
                <div className="bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-500">
                  Malaysia
                </div>
              </div>
            </div>

            <div className="px-5 pt-3 shrink-0 border-t border-slate-100"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
              <button
                type="button"
                onClick={saveAddress}
                disabled={!draftLine1.trim() || !draftPostal.trim() || !draftCity.trim() || !draftState}
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
          onPointerDown={(e) => { e.preventDefault(); setSamplePreview(null); }}>
          <div className="relative w-full max-w-sm" onPointerDown={e => e.stopPropagation()}>
            <img src={samplePreview} alt="Sample document" className="w-full rounded-2xl object-contain max-h-[70dvh]" />
            <button onClick={() => setSamplePreview(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white active:scale-90 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    )}

    {/* Leaving with unsaved input — Floating Message Standard */}
    {showLeaveConfirm && (
      <FloatingMessage
        title="Discard this booking?"
        description="Your uploaded documents won't be kept — you'll need to upload them again if you save a draft or come back later."
        options={[
          { label: 'Discard', destructive: true, onPress: handleDiscardLeave },
          { label: 'Save Draft', onPress: handleSaveDraftLeave },
          { label: 'Continue Editing', onPress: handleContinueEditing },
        ]}
        onDismiss={handleContinueEditing}
      />
    )}

    {/* Rider profile sheet — outside scroll container so fixed positioning works correctly */}
    {riderProfileOpen && (() => {
      const r = riders.find(rd => rd.id === selectedRiderId);
      if (!r) return null;
      const close = () => setRiderProfileOpen(false);
      return (
        <RepresentativeSheet
          name={r.name}
          dropPoint={r.jubah_drop_point || '—'}
          method={isPostageDelivery ? 'Pickup & Postage' : 'Self Pickup'}
          icNumber={r.ic_number}
          phone={r.phone}
          waMessage={`Asslammualaikum Jubah rider, saya perlukan 6 digit IC ${r.ic_number ? r.ic_number.replace(/\D/g,'').slice(0,6) + '-XX-XXXX' : 'XXXXXX-XX-XXXX'} terakhir awak untuk pengisian representative jubah ${university.includes('Pahang') ? 'UMPSA' : university.includes('UiTM') || university.includes('MARA') ? 'UiTM' : university.includes('Kelantan') ? 'UMK' : university.includes('Kebangsaan') ? 'UKM' : 'UIAM'}`}
          onClose={close}
        />
      );
    })()}
    </>
  );
};
