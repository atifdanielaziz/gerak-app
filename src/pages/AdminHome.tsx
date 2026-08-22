import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { useLoadOnActive } from '../hooks/useLoadOnActive';
import { NativeSelect } from '../components/NativeSelect';
import { UNIVERSITIES, UNIVERSITY_MAP, universityKeyFromCampus } from '../lib/universities';
import {
  BarChart3, Car, Users, Clock,
  AlertCircle, RefreshCw, Trash2,
  Megaphone,
  FileImage, ShieldCheck,
  CalendarDays, Upload, Eye, ArrowLeftRight, GraduationCap,
  ChevronLeft, Check, TrendingUp, Bike,
  Bell, User, Ban, History, Minus, Plus,
} from 'lucide-react';
import { JubahBannerSubTab } from './admin/jubah/JubahBannerSubTab';
import { JubahPriceSubTab } from './admin/jubah/JubahPriceSubTab';
import { JubahFacultySubTab } from './admin/jubah/JubahFacultySubTab';
import { DriversTab, type DriversTabHandle } from './admin/drivers/DriversTab';
import { UsersTab, type UsersTabHandle } from './admin/users/UsersTab';
import { ProfileSheet, type ProfileUser } from './admin/users/ProfileSheet';
import { RoutesTab, type RoutesTabHandle } from './admin/routes/RoutesTab';
import { VerifyDocsTab, type VerifyDocsTabHandle } from './admin/verify/VerifyDocsTab';
import { BannersTab, type BannersTabHandle } from './admin/banners/BannersTab';
import { ReceiptsTab, type ReceiptsTabHandle } from './admin/receipts/ReceiptsTab';
import { CalendarTab, type CalendarTabHandle } from './admin/calendar/CalendarTab';
import { EarningsTab, type EarningsTabHandle } from './admin/earnings/EarningsTab';
import { OrdersTab, type OrdersTabHandle } from './admin/orders/OrdersTab';
import { JubahRiderSubTab, type JubahRiderSubTabHandle } from './admin/jubah/JubahRiderSubTab';
import { JubahCustomerSubTab, type JubahBookingRow } from './admin/jubah/JubahCustomerSubTab';
import { JubahCustomerDetailsSubTab } from './admin/jubah/JubahCustomerDetailsSubTab';
import { ActivityLogTab, type ActivityLogTabHandle } from './admin/activity/ActivityLogTab';

type AdminTab = 'orders' | 'drivers' | 'users' | 'banners' | 'receipts' | 'calendar' | 'routes' | 'verify' | 'jubah' | 'earnings' | 'activity';

// Single source of truth for tab metadata — shared by the mobile tab-strip
// and the desktop sidebar (see AdminHome's return), so the superadmin-only
// gate can never drift between the two.
const ADMIN_TABS: { id: AdminTab; label: string; icon: React.ElementType; superadminOnly: boolean }[] = [
  { id: 'orders',   label: 'Orders',    icon: BarChart3,       superadminOnly: false },
  { id: 'drivers',  label: 'Invite',    icon: Car,             superadminOnly: false },
  { id: 'users',    label: 'Staff',     icon: Users,           superadminOnly: false },
  { id: 'verify',   label: 'Verify',    icon: ShieldCheck,     superadminOnly: false },
  { id: 'jubah',    label: 'Jubah',     icon: GraduationCap,   superadminOnly: false },
  { id: 'banners',  label: 'Banners',   icon: Megaphone,       superadminOnly: false },
  { id: 'routes',   label: 'Routes',    icon: ArrowLeftRight,  superadminOnly: false },
  { id: 'receipts', label: 'Receipts',  icon: FileImage,       superadminOnly: true  },
  { id: 'earnings', label: 'Earnings',  icon: TrendingUp,      superadminOnly: true  },
  { id: 'activity', label: 'Activity',  icon: History,         superadminOnly: true  },
  { id: 'calendar', label: 'Calendar',  icon: CalendarDays,    superadminOnly: false },
];

export const AdminHome: React.FC = () => {
  const {
    user, setCurrentPage, setSheetOpen, notifications,
    activeRole, isPreviewMode, switchToDriverMode, switchToRiderMode, enterPreviewMode,
    setLeaveGuard, showConfirmModal,
  } = useApp();

  const isSuperAdmin = user.role === 'superadmin';
  // profiles.campus is always written by our own UI (Register, Invite,
  // the Staff tab's campus picker) using the exact canonical casing from
  // src/lib/universities.ts, so it's used as-is — no per-word title-casing
  // here, which used to only ever run on single-word Pekan/Gambang and
  // would otherwise mangle multi-word campuses like "Kota Bharu".
  const adminCampus = user.campus;

  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  // campusView only ever drives Routes/Orders (Gerak Rides transport,
  // deliberately UMPSA-only) — default Gambang unless this admin's own
  // campus is literally Pekan; a non-UMPSA admin has no meaningful
  // default here anyway since those tabs aren't relevant to them.
  const [campusView, setCampusView] = useState<'Pekan' | 'Gambang'>(
    adminCampus === 'Pekan' ? 'Pekan' : 'Gambang'
  );
  const [toast, setToast] = useState('');

  // Reported up by UsersTab's own pending-action confirm dialog, so the
  // shared "hide BottomNav while any sheet is open" effect below still sees
  // it. sheetUser/ProfileSheet stay here since Receipts also opens it.
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [sheetUser, setSheetUser]           = useState<ProfileUser | null>(null);

  // Jubah delivery on/off — toggled from a button inside the Jubah tab, but
  // declared here (pre-existing quirk, not moved as part of this refactor).
  const [jubahActive, setJubahActive]   = useState(false);
  const [togglingJubah, setTogglingJubah] = useState(false);
  // Bumped every time handleToggleJubah writes a fresh value, so a slower
  // loadJubahData() settings-fetch that was already in flight before the
  // toggle (common on a slow connection) can detect it's now stale and skip
  // overwriting the just-toggled value — was previously clobbering the
  // toggle back to its old colour a moment after it changed.
  const jubahActiveSeqRef = useRef(0);

  // Reported up by ReceiptsTab's own gate-master confirm dialog, so the
  // shared "hide BottomNav while any sheet is open" effect still sees it.
  const [receiptsModalOpen, setReceiptsModalOpen] = useState(false);

  // ── Jubah tab state ────────────────────────────────────────────────────────
  const [jubahBookings,      setJubahBookings]      = useState<JubahBookingRow[]>([]);
  const [jubahBookingsLoading, setJubahBookingsLoading] = useState(false);
  // Real total row count from the DB (via the query's count:'exact'), vs
  // jubahBookings.length which is capped at 1000 — lets the UI show
  // "showing X of Y" only when the cap actually truncated something.
  const [jubahBookingsTotalCount, setJubahBookingsTotalCount] = useState<number | null>(null);
  const [jubahAdminView,     setJubahAdminView]     = useState<'list' | 'card'>('list');
  const [jubahAdminSelected, setJubahAdminSelected] = useState<JubahBookingRow | null>(null);
  const [jubahSubTab,        setJubahSubTab]        = useState<'customer' | 'customer_details' | 'rider' | 'price' | 'faculty' | 'banner'>('rider');
  // Defence in depth — the sub-tab button itself is already hidden for
  // non-superadmin, but if a regular admin somehow lands on 'price' (e.g.
  // a stale tab from before a role downgrade), render as if 'rider' were
  // selected rather than silently rendering nothing. A derived value
  // (not a useEffect writing back to jubahSubTab) avoids a pointless
  // extra render on every tab switch.
  const effectiveJubahSubTab = jubahSubTab === 'price' && !isSuperAdmin ? 'rider' : jubahSubTab;
  // Reported up by JubahCustomerSubTab's own receipt-preview modal.
  const [jubahCustomerModalOpen, setJubahCustomerModalOpen] = useState(false);
  // Which university's Jubah data the panel shows — superadmin can switch
  // freely (see the University selector below); regular admin never changes
  // this (locked to 'umpsa', their implicit university today — see
  // loadJubahData, which uses their existing campus lock instead once this
  // isn't superadmin).
  const [jubahUniversityView, setJubahUniversityView] = useState('umpsa');
  // Same university this admin's Jubah data is actually scoped to (see
  // loadJubahData) — shown next to card headers so it's clear at a glance
  // whose data is on screen, same idea as Pricing Matrix's own dropdown.
  const jubahUniversityLabel = UNIVERSITY_MAP[
    isSuperAdmin ? jubahUniversityView : (universityKeyFromCampus(adminCampus) ?? 'umpsa')
  ]?.shortLabel ?? 'UMPSA';
  const [jubahOverviewCollapsed, setJubahOverviewCollapsed] = useState(true);

  const jubahStats = useMemo(() => {
    // jubahBookings is already scoped to one university/campus by
    // loadJubahData's query — no further filtering needed here.
    const active    = jubahBookings.filter(b => b.status !== 'cancelled');
    const cancelled = jubahBookings.length - active.length;

    let collected = 0;
    let outstanding = 0;
    const statusCounts: Record<string, number> = {};
    const modeCounts = { deposit: 0, pickup: 0, postage: 0 };

    active.forEach(b => {
      statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
      if (b.payment_mode === 'deposit') modeCounts.deposit++;
      else if (b.payment_mode === 'postage') modeCounts.postage++;
      else modeCounts.pickup++;

      if (b.payment_mode === 'deposit') {
        if (!b.initial_paid) {
          outstanding += b.cost + (b.balance_due ?? 0);
        } else if (!b.balance_paid) {
          collected += b.cost;
          outstanding += b.balance_due ?? 0;
        } else {
          collected += b.cost + (b.balance_due ?? 0);
        }
      } else if (b.initial_paid) {
        collected += b.cost;
      } else {
        outstanding += b.cost;
      }
    });

    return { total: active.length, cancelled, collected, outstanding, statusCounts, modeCounts };
  }, [jubahBookings]);

  const jubahNeedsReconciliation = useMemo(
    () => jubahBookings.filter(b => b.needs_reconciliation),
    [jubahBookings]
  );

  const BANNER_BUCKET = 'jubah-banners';
  type DocField = { id: string; field_key: string; label: string; hint: string | null; position: number };
  const [sampleDocsPage,   setSampleDocsPage]   = useState<{ key: string; label: string } | null>(null);
  const [docFields,        setDocFields]        = useState<DocField[]>([]);
  const [sampleUrls,       setSampleUrls]       = useState<Record<string, string>>({});
  const [sampleLoaded,     setSampleLoaded]     = useState<Record<string, boolean>>({});
  const [sampleUploading,  setSampleUploading]  = useState<string | null>(null);
  const [currentSampleDoc, setCurrentSampleDoc] = useState<string | null>(null);
  const sampleFileRef   = useRef<HTMLInputElement>(null);
  const mainScrollRef   = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const driversTabRef   = useRef<DriversTabHandle>(null);
  const usersTabRef     = useRef<UsersTabHandle>(null);
  const routesTabRef    = useRef<RoutesTabHandle>(null);
  const verifyTabRef    = useRef<VerifyDocsTabHandle>(null);
  const bannersTabRef   = useRef<BannersTabHandle>(null);
  const receiptsTabRef  = useRef<ReceiptsTabHandle>(null);
  const calendarTabRef  = useRef<CalendarTabHandle>(null);
  const earningsTabRef  = useRef<EarningsTabHandle>(null);
  const activityTabRef  = useRef<ActivityLogTabHandle>(null);
  const ordersTabRef    = useRef<OrdersTabHandle>(null);
  const jubahRiderTabRef = useRef<JubahRiderSubTabHandle>(null);
  // Reported up by DriversTab's own invite-confirm modal, so the shared
  // "hide BottomNav while any sheet is open" effect below still sees it.
  const [driversModalOpen, setDriversModalOpen] = useState(false);
  // Reported up by JubahRiderSubTab's own assignment sheet.
  const [jubahRiderModalOpen, setJubahRiderModalOpen] = useState(false);

  // Report to AppContext whenever any bottom sheet/modal here is open,
  // so BottomNav can hide itself and never overlap sheet content.
  useEffect(() => {
    const anyOpen = !!sheetUser || jubahRiderModalOpen || jubahCustomerModalOpen || usersModalOpen || receiptsModalOpen || driversModalOpen;
    if (!anyOpen) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [sheetUser, jubahRiderModalOpen, jubahCustomerModalOpen, usersModalOpen, receiptsModalOpen, driversModalOpen, setSheetOpen]);

  const [clearingReconciliation, setClearingReconciliation] = useState<string | null>(null);
  const handleClearReconciliation = async (b: JubahBookingRow) => {
    setClearingReconciliation(b.id);
    const { error } = await supabase.from('jubah_bookings')
      .update({ needs_reconciliation: false })
      .eq('id', b.id);
    setClearingReconciliation(null);
    if (error) { showToast('Failed to clear: ' + error.message); return; }
    setJubahBookings(prev => prev.map(r => r.id === b.id ? { ...r, needs_reconciliation: false } : r));
  };

  const loadJubahData = useCallback(async () => {
    setJubahBookingsLoading(true);

    const mySeq = jubahActiveSeqRef.current;
    const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'jubah_active').single();
    if (setting && jubahActiveSeqRef.current === mySeq) setJubahActive(setting.value === 'true');

    // Capped, not truly paginated — the Customer Directory's search box
    // filters over whatever's already loaded, so real "load more" paging
    // would silently make search miss anything not yet loaded. A generous
    // cap plus a visible "showing X of Y" note (see JubahCustomerSubTab)
    // bounds the worst case without touching how search behaves; at actual
    // current row counts (dozens–hundreds) this never engages.
    let bookingsQ = supabase.from('jubah_bookings')
      .select('id, reference, full_name, ic_number, hp_number, email, matric_id, university, university_key, campus, faculty, remark, rider_name, rider_phone, status, payment_mode, cost, balance_due, balance_paid, balance_paid_at, balance_proof_url, initial_paid, initial_paid_at, delivery_address, docs_path, payment_path, oscar_path, skpg_path, konvo_path, ic_path, created_at, needs_reconciliation, reconciliation_note', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(1000);
    // Superadmin scopes by the new University switcher (any university);
    // regular admin keeps their existing Pekan/Gambang campus lock exactly
    // as before — every campus-scoped admin today is implicitly UMPSA-only,
    // so this isn't a narrowing, and it avoids widening their scope to all
    // of UMPSA (both campuses) the moment university-level filtering exists.
    bookingsQ = isSuperAdmin
      ? bookingsQ.eq('university_key', jubahUniversityView)
      : bookingsQ.eq('campus', adminCampus);
    const { data: bookingsData, count: bookingsCount, error: bookingsError } = await bookingsQ;
    setJubahBookingsTotalCount(bookingsCount ?? null);
    if (bookingsError) {
      console.error('[GERAK] jubah_bookings load error:', bookingsError.message, bookingsError.details);
      // Fallback: fetch without new columns in case migration not yet applied
      let fallbackQ = supabase.from('jubah_bookings')
        .select('id, reference, full_name, hp_number, matric_id, campus, faculty, remark, rider_name, status, payment_mode, created_at')
        .order('created_at', { ascending: false });
      fallbackQ = isSuperAdmin ? fallbackQ : fallbackQ.eq('campus', adminCampus);
      const { data: fallbackData, error: fallbackError } = await fallbackQ;
      if (fallbackError) console.error('[GERAK] jubah_bookings fallback error:', fallbackError.message);
      setJubahBookings(((fallbackData ?? []) as JubahBookingRow[]).map(r => ({
        ...r,
        ic_number: '', email: null, university: '', university_key: 'umpsa', cost: 0, balance_due: 0, balance_paid: false, balance_paid_at: null, balance_proof_url: null,
        initial_paid: false, initial_paid_at: null,
        delivery_address: null, docs_path: null, payment_path: null, oscar_path: null,
        skpg_path: null, konvo_path: null, ic_path: null,
        needs_reconciliation: false, reconciliation_note: null,
      })));
    } else {
      setJubahBookings((bookingsData as JubahBookingRow[]) ?? []);
    }
    setJubahBookingsLoading(false);
  }, [isSuperAdmin, adminCampus, jubahUniversityView]);

  useLoadOnActive(activeTab === 'jubah', loadJubahData);

  // ── Admin Jubah back navigation (list <-> card; card now holds
  //    everything — stepper, confirm, full details, receipt, documents —
  //    so there's no longer a separate "details" page to hop through). ────
  // Registers with AppContext's single shared goBack() (see GerakRental.tsx
  // for the same pattern) instead of adding a second, independent popstate
  // listener + manual pushState — two listeners on the same window event
  // both firing meant a single hardware/gesture back-press here could BOTH
  // close the card AND (since AppContext's own popstate handler runs
  // unconditionally alongside it) navigate away from Admin Home entirely.
  useEffect(() => {
    if (activeTab !== 'jubah' || jubahSubTab !== 'customer' || jubahAdminView !== 'card') {
      setLeaveGuard(null);
      return;
    }
    setLeaveGuard(() => () => { setJubahAdminSelected(null); setJubahAdminView('list'); });
    return () => setLeaveGuard(null);
  }, [activeTab, jubahSubTab, jubahAdminView, setLeaveGuard]);

  const goToAdminCard = (b: JubahBookingRow) => {
    setJubahAdminSelected(b);
    setJubahAdminView('card');
  };
  const goAdminBack = () => { setJubahAdminSelected(null); setJubahAdminView('list'); };
  // Distinct from goAdminBack — used after a delete, when there's no page
  // to browser-back to since the booking it referred to no longer exists.
  const goToJubahList = () => { setJubahAdminView('list'); setJubahAdminSelected(null); };

  // Exposes this header+tab-bar's live rendered height as a CSS variable on
  // the shared scroll container, so any sticky sub-page header rendered
  // further down (e.g. JubahCustomerSubTab's own sticky back-row) can sit
  // at `top: var(--admin-sticky-header-h)` instead of `top: 0` — two
  // sticky elements at top:0 in the same scroll container overlap rather
  // than stack. ResizeObserver (not a one-time measurement) because the
  // tab bar's item count/width changes with role (superadmin sees more
  // tabs), which changes this header's height.
  useEffect(() => {
    const el = stickyHeaderRef.current;
    if (!el) return;
    const apply = () => {
      mainScrollRef.current?.style.setProperty('--admin-sticky-header-h', `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sampleDocsPage, activeTab, isSuperAdmin]);

  useEffect(() => {
    if (!sampleDocsPage) {
      setSampleUrls({}); setSampleLoaded({}); setDocFields([]);
      return;
    }
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;

    const load = async () => {
      let fields: DocField[] = [];
      const { data } = await supabase
        .from('jubah_doc_fields')
        .select('id, field_key, label, hint, position')
        .eq('university_key', sampleDocsPage.key)
        .order('position');

      if (data && data.length > 0) {
        fields = data;
      } else {
        // First open for this university — copy from UMPSA defaults
        const { data: defaults } = await supabase
          .from('jubah_doc_fields')
          .select('field_key, label, hint, position')
          .eq('university_key', 'umpsa')
          .order('position');
        if (defaults?.length) {
          const { data: inserted } = await supabase
            .from('jubah_doc_fields')
            .insert(defaults.map(d => ({ university_key: sampleDocsPage.key, field_key: d.field_key, label: d.label, hint: d.hint, position: d.position })))
            .select('id, field_key, label, hint, position');
          fields = inserted ?? [];
        }
      }

      setDocFields(fields);

      const bust = Date.now();
      const urls: Record<string, string> = {};
      fields.forEach(f => {
        const { data: u } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(`samples/${sampleDocsPage.key}/${f.field_key}.jpg`);
        urls[f.field_key] = `${u.publicUrl}?t=${bust}`;
      });
      setSampleUrls(urls);
      setSampleLoaded({});
    };

    load();
  }, [sampleDocsPage]);


  const handleSampleUpload = async (file: File, fieldId: string) => {
    if (!sampleDocsPage) return;
    setSampleUploading(fieldId);
    const path = `samples/${sampleDocsPage.key}/${fieldId}.jpg`;
    const { error } = await supabase.storage.from(BANNER_BUCKET).upload(path, file, { upsert: true, contentType: file.type, cacheControl: '31536000' });
    if (error) { showToast('Upload failed: ' + error.message); setSampleUploading(null); return; }
    const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(path);
    setSampleUrls(prev => ({ ...prev, [fieldId]: `${data.publicUrl}?t=${Date.now()}` }));
    setSampleLoaded(prev => ({ ...prev, [fieldId]: true }));
    setSampleUploading(null);
    showToast('Sample uploaded ✓');
  };

  const handleSampleDelete = async (fieldId: string) => {
    if (!sampleDocsPage) return;
    const path = `samples/${sampleDocsPage.key}/${fieldId}.jpg`;
    await supabase.storage.from(BANNER_BUCKET).remove([path]);
    setSampleLoaded(prev => ({ ...prev, [fieldId]: false }));
    showToast('Sample removed.');
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleToggleJubah = async () => {
    setTogglingJubah(true);
    const newVal = (!jubahActive).toString();
    await supabase.from('app_settings').update({ value: newVal }).eq('key', 'jubah_active');
    jubahActiveSeqRef.current += 1; // invalidate any older in-flight settings fetch
    setJubahActive(!jubahActive);
    setTogglingJubah(false);
    showToast(`Jubah delivery ${!jubahActive ? 'activated' : 'deactivated'}.`);
  };

  // Guard — redirect non-admin users
  if (!['admin', 'superadmin'].includes(user.role)) {
    setCurrentPage('dashboard');
    return null;
  }

  // Shared by the mobile refresh button and the desktop topbar's refresh
  // button. Only Banners falls through to the catch-all now — Jubah used to
  // as well (a silent no-op: it fell through to bannersTabRef's reload,
  // which does nothing visible since Banners isn't the active sub-view).
  // loadJubahData() covers both the Overview/Status Breakdown stats and the
  // Customer Directory (it's the same function JubahCustomerSubTab's own
  // "reload" prop already points to); the Rider sub-tab loads its directory
  // separately, so it needs its own ref reload on top of that.
  const refreshActiveTab = () =>
    activeTab === 'orders' ? ordersTabRef.current?.reload() :
    activeTab === 'drivers' ? driversTabRef.current?.reload() :
    activeTab === 'users' ? usersTabRef.current?.reload() :
    activeTab === 'receipts' ? receiptsTabRef.current?.reload() :
    activeTab === 'routes' ? routesTabRef.current?.reload() :
    activeTab === 'verify' ? verifyTabRef.current?.reload() :
    activeTab === 'calendar' ? calendarTabRef.current?.reload() :
    activeTab === 'earnings' ? earningsTabRef.current?.reload() :
    activeTab === 'activity' ? activityTabRef.current?.reload() :
    activeTab === 'jubah' ? (loadJubahData(), effectiveJubahSubTab === 'rider' && jubahRiderTabRef.current?.reload()) :
    bannersTabRef.current?.reload();

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <>
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 h-full bg-white">

      {/* Desktop sidebar — hidden below 1024px, where the sticky mobile
          header + tab-strip further down still handles navigation */}
      {!sampleDocsPage && (
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:h-full lg:border-r lg:border-slate-100 lg:overflow-y-auto lg:no-scrollbar">
          <nav className="flex-1 flex flex-col gap-1 p-3">
            {ADMIN_TABS
              .filter(t => !t.superadminOnly || user.role === 'superadmin')
              .map(tab => {
                const Icon = tab.icon;
                return (
                  // Same opacity-overlay technique as the mobile tab bar
                  // below — see its comment for why (WebView repaint bug).
                  <button key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="relative w-full rounded-xl transition-transform transform-gpu active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-left text-slate-500">
                      <Icon className="w-4 h-4 shrink-0" />
                      {tab.label}
                    </span>
                    <span
                      className={`absolute inset-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold text-left transition-opacity duration-150 ${
                        activeTab === tab.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {tab.label}
                    </span>
                  </button>
                );
              })}
          </nav>

          <div className="p-3 border-t border-slate-100 flex flex-col gap-1">
            <button onPointerDown={(e) => { e.preventDefault(); setCurrentPage('notifications'); }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-transform active:scale-[0.98]">
              <Bell className="w-4 h-4 shrink-0" />
              Notifications
              {unreadCount > 0 && (
                <span className="ml-auto w-5 h-5 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onPointerDown={(e) => { e.preventDefault(); setCurrentPage('profile'); }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-transform active:scale-[0.98]">
              <User className="w-4 h-4 shrink-0" />
              My Profile
            </button>

            {user.role === 'superadmin' && (
              <div className="flex flex-col gap-1 pt-2 mt-1 border-t border-slate-100">
                <p className="px-3 pb-1 text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Preview as</p>
                <button onPointerDown={(e) => { e.preventDefault(); switchToDriverMode(); }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-transform transform-gpu active:scale-[0.98] ${
                    activeRole === 'driver' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  <Car className="w-3.5 h-3.5 shrink-0" /> Driver
                </button>
                <button onPointerDown={(e) => { e.preventDefault(); switchToRiderMode(); }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-transform transform-gpu active:scale-[0.98] ${
                    activeRole === 'rider' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  <Bike className="w-3.5 h-3.5 shrink-0" /> Rider
                </button>
                <button onPointerDown={(e) => { e.preventDefault(); enterPreviewMode(); }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-transform transform-gpu active:scale-[0.98] ${
                    isPreviewMode ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  <Eye className="w-3.5 h-3.5 shrink-0" /> Customer
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Content pane */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:h-full">

        {/* Desktop topbar — mobile keeps its own sticky header further down instead */}
        {!sampleDocsPage && (
          <div className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <h3 className="text-base font-black text-slate-800 m-0">
              {ADMIN_TABS.find(t => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={refreshActiveTab}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

    <div ref={mainScrollRef} className="flex-1 min-h-0 bg-white overflow-y-auto overflow-x-hidden no-scrollbar pb-4 px-4 lg:px-6 animate-fade-in flex flex-col gap-4 touch-pan-y">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg text-center animate-fade-in">
          {toast}
        </div>
      )}

      {/* Profile sheet */}
      {sheetUser && <ProfileSheet u={sheetUser} onClose={() => setSheetUser(null)} showToast={showToast} />}

      {/* ── Sub-page Standard: replace all tab content when active ── */}
      {sampleDocsPage ? (
        <>
          {/* Hidden file input */}
          <input type="file" ref={sampleFileRef} accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file && currentSampleDoc) await handleSampleUpload(file, currentSampleDoc);
              if (sampleFileRef.current) sampleFileRef.current.value = '';
            }}
          />

          {/* Hidden image probes */}
          <div className="hidden">
            {docFields.map(f => sampleUrls[f.field_key] && (
              <img key={f.id} src={sampleUrls[f.field_key]}
                onLoad={() => setSampleLoaded(prev => ({ ...prev, [f.field_key]: true }))}
                onError={() => setSampleLoaded(prev => ({ ...prev, [f.field_key]: false }))}
              />
            ))}
          </div>

          {/* Upload Documents (Sample) card */}
          <div className="mt-4 bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4"
            style={{ marginBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>

            {/* Card header: back + title */}
            <div className="flex items-center gap-3">
              <button onClick={() => setSampleDocsPage(null)}
                className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="flex-1 text-sm font-semibold text-slate-700">Upload Documents (Sample)</h3>
            </div>

            {/* Doc fields — upload sample image per field */}
            {docFields.map(field => (
              <div key={field.id} className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-slate-600">{field.label}</p>
                {/* Sample image upload */}
                {sampleLoaded[field.field_key] ? (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5">
                    <img src={sampleUrls[field.field_key]} alt={field.label} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-700">Sample uploaded</p>
                      <p className="text-xs text-emerald-500">Tap to replace or remove</p>
                    </div>
                    <button type="button"
                      onClick={() => { setCurrentSampleDoc(field.field_key); setTimeout(() => sampleFileRef.current?.click(), 0); }}
                      className="text-slate-400 active:scale-90 transition shrink-0 p-1">
                      <Upload className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => showConfirmModal({
                        title: 'Delete Sample?',
                        message: `This removes the sample image for "${field.label}". This can't be undone.`,
                        confirmLabel: 'DELETE',
                        onConfirm: () => handleSampleDelete(field.field_key),
                      })}
                      className="text-slate-400 active:scale-90 transition shrink-0 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button"
                    disabled={sampleUploading === field.field_key}
                    onClick={() => { setCurrentSampleDoc(field.field_key); setTimeout(() => sampleFileRef.current?.click(), 0); }}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition cursor-pointer disabled:opacity-50">
                    {sampleUploading === field.field_key
                      ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                      : <><Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload {field.label} Sample</span></>
                    }
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (<>

      {/* Sticky header + tab switcher — mobile only; desktop uses the sidebar + topbar instead */}
      <div ref={stickyHeaderRef} className="lg:hidden sticky top-0 z-20 -mx-4 px-4 pt-1 pb-2 bg-slate-50/95 backdrop-blur-sm flex flex-col">

        {/* Tab bar */}
      <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
        {ADMIN_TABS
          .filter(t => !t.superadminOnly || user.role === 'superadmin')
          .map(tab => (
            // Two stacked layers instead of toggling bg-primary/text-white
            // directly — this WebView unreliably repaints background/text
            // color changes (confirmed live: the pill stays uncolored for
            // a tap or more after switching), but reliably repaints opacity.
            // The red+white layer always exists at full opacity underneath;
            // only its opacity is toggled, so there's nothing to repaint.
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative shrink-0 rounded-xl transition-transform transform-gpu active:scale-95"
            >
              <span className="block px-4 py-2 text-xs font-semibold text-slate-400 whitespace-nowrap">
                {tab.label}
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold whitespace-nowrap transition-opacity duration-150 ${
                  activeTab === tab.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {tab.label}
              </span>
            </button>
          ))}
      </div>
      </div>

      {/* ── DRIVERS TAB ── */}
      {activeTab === 'drivers' && (
        <DriversTab
          ref={driversTabRef}
          active={activeTab === 'drivers'}
          isSuperAdmin={isSuperAdmin}
          adminCampus={adminCampus}
          userName={user.name}
          showToast={showToast}
          onModalOpenChange={setDriversModalOpen}
        />
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <UsersTab
          ref={usersTabRef}
          active={activeTab === 'users'}
          isSuperAdmin={isSuperAdmin}
          adminCampus={adminCampus}
          showToast={showToast}
          onViewProfile={setSheetUser}
          onModalOpenChange={setUsersModalOpen}
        />
      )}

      {/* ── BANNERS TAB ── */}
      {activeTab === 'banners' && (
        <BannersTab
          ref={bannersTabRef}
          active={activeTab === 'banners'}
          showToast={showToast}
        />
      )}

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        <OrdersTab
          ref={ordersTabRef}
          active={activeTab === 'orders'}
          isSuperAdmin={isSuperAdmin}
          campusView={campusView}
          onCampusViewChange={setCampusView}
          showToast={showToast}
        />
      )}

      {/* ── ROUTES TAB ── */}
      {activeTab === 'routes' && (
        <RoutesTab
          ref={routesTabRef}
          active={activeTab === 'routes'}
          isSuperAdmin={isSuperAdmin}
          adminCampus={adminCampus}
          campusView={campusView}
          onCampusViewChange={setCampusView}
          showToast={showToast}
        />
      )}

      {/* ── VERIFY TAB ── */}
      {activeTab === 'verify' && (
        <VerifyDocsTab
          ref={verifyTabRef}
          active={activeTab === 'verify'}
          isSuperAdmin={isSuperAdmin}
          adminCampus={adminCampus}
          showToast={showToast}
          onViewProfile={setSheetUser}
        />
      )}

      {/* ── JUBAH TAB ── */}
      {activeTab === 'jubah' && (
        <div className="flex flex-col gap-4">

          {/* Jubah Period Toggle + sub-tab switcher — hidden when inside customer sub-pages */}
          {!(jubahSubTab === 'customer' && jubahAdminView !== 'list') && (<>
            {/* University switcher — superadmin only; regular admin is locked to
                their own university (today, that's always UMPSA — see
                loadJubahData's campus-based branch), matching how the existing
                campus lock already works for other tabs. Changing this re-scopes
                the ENTIRE Jubah panel below: Overview, Riders, Representative/
                Customer Directory, AND Pricing Matrix/Rider Commission (which
                used to each have their own separate dropdown — now just this
                one, same labeled-pill style Pricing Matrix's used to have,
                not the old icon-only trigger). */}
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <div className="w-28 shrink-0">
                  <NativeSelect
                    value={jubahUniversityView}
                    onChange={v => { setJubahUniversityView(v); setJubahAdminView('list'); setJubahAdminSelected(null); }}
                    options={UNIVERSITIES.map(u => ({ value: u.key, label: u.shortLabel }))}
                    placeholder="Select university"
                  />
                </div>
              )}
              <button
                onPointerDown={e => { e.preventDefault(); handleToggleJubah(); }}
                disabled={togglingJubah}
                aria-label="Toggle Jubah delivery period"
                title={jubahActive ? 'Jubah delivery period: OPEN — students can book' : 'Jubah delivery period: CLOSED — booking disabled'}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-transform transform-gpu active:scale-95 disabled:opacity-50 ${
                  jubahActive ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                {togglingJubah ? '…' : jubahActive ? <><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />ON</> : <><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1" />OFF</>}
              </button>
            </div>

            {/* Payment records that need manual financial reconciliation. */}
            {jubahNeedsReconciliation.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-3xl p-5 flex flex-col gap-3">
                <p className="text-xs font-black text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Needs Reconciliation ({jubahNeedsReconciliation.length})
                </p>
                <p className="text-[11px] text-red-600/80 font-semibold -mt-1.5">
                  These bookings have payment records that need manual verification. Review the evidence, then mark each one resolved.
                </p>
                <div className="flex flex-col gap-2">
                  {jubahNeedsReconciliation.map(b => (
                    <div key={b.id} className="bg-white border border-red-100 rounded-2xl p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">{b.reference} — {b.full_name}</p>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{b.reconciliation_note}</p>
                      </div>
                      <button
                        onPointerDown={e => { e.preventDefault(); handleClearReconciliation(b); }}
                        disabled={clearingReconciliation === b.id}
                        className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-red-600 text-white active:scale-95 transition-transform disabled:opacity-50"
                      >
                        {clearingReconciliation === b.id ? '…' : 'Mark Reviewed'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overview stats — computed client-side from jubahBookings, already
                loaded for the Customer Directory below; no extra query. */}
            <div className={`bg-white border border-slate-100 rounded-3xl flex flex-col ${jubahOverviewCollapsed ? 'p-3.5 gap-0' : 'p-4 gap-4'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-slate-400" /> Overview ({jubahUniversityLabel})
                </h3>
                <button
                  type="button"
                  onPointerDown={e => { e.preventDefault(); setJubahOverviewCollapsed(v => !v); }}
                  aria-label={jubahOverviewCollapsed ? 'Expand overview' : 'Minimize overview'}
                  title={jubahOverviewCollapsed ? 'Expand overview' : 'Minimize overview'}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform shrink-0"
                >
                  {jubahOverviewCollapsed ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                </button>
              </div>

              {!jubahOverviewCollapsed && (<>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">Total Orders</span>
                  <span className="text-lg font-black text-slate-800">{jubahStats.total}</span>
                </div>
                <div className="border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">Revenue Collected</span>
                  <span className="text-lg font-black text-slate-800">RM{jubahStats.collected.toFixed(2)}</span>
                </div>
                <div className="border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">Revenue Outstanding</span>
                  <span className="text-lg font-black text-slate-800">RM{jubahStats.outstanding.toFixed(2)}</span>
                </div>
                <div className="border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center">
                    <Ban className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">Cancelled</span>
                  <span className="text-lg font-black text-slate-800">{jubahStats.cancelled}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-[1.4fr_1fr] gap-3">
                {/* Status breakdown */}
                <div className="border border-slate-100 rounded-2xl p-4 flex flex-col gap-1">
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">Status Breakdown</p>
                  {([
                    { label: 'Pending',    statuses: ['ordered'],       color: 'bg-slate-400' },
                    { label: 'Paid',       statuses: ['paid'],          color: 'bg-blue-500' },
                    { label: 'Processing', statuses: ['processing'],    color: 'bg-violet-500' },
                    { label: 'Collected',  statuses: ['collected'],     color: 'bg-amber-500' },
                    // 'at_hub' is postage mode's own terminal step (its
                    // equivalent of 'delivered' for pickup/deposit) — folded
                    // in here rather than its own row, so a completed
                    // postage booking still counts toward this total.
                    { label: 'Delivered',  statuses: ['delivered', 'at_hub'], color: 'bg-emerald-600' },
                  ]).map(row => {
                    const count = row.statuses.reduce((sum, s) => sum + (jubahStats.statusCounts[s] ?? 0), 0);
                    const pct = jubahStats.total > 0 ? Math.round((count / jubahStats.total) * 100) : 0;
                    return (
                      <div key={row.label} className="flex items-center gap-2.5 py-1">
                        <span className="w-16 shrink-0 text-[10.5px] font-semibold text-slate-500">{row.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-5 shrink-0 text-right text-xs font-black text-slate-700">{count}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Payment mode split */}
                <div className="border border-slate-100 rounded-2xl p-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-slate-400 mb-0.5">Payment Mode</p>
                  {([
                    { label: 'Deposit', key: 'deposit' as const, color: 'bg-amber-500' },
                    { label: 'Pickup',  key: 'pickup'  as const, color: 'bg-slate-400' },
                    { label: 'Postage', key: 'postage' as const, color: 'bg-blue-500' },
                  ]).map(row => (
                    <div key={row.key} className="flex items-center justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <span className={`w-2 h-2 rounded-full ${row.color}`} />
                        {row.label}
                      </span>
                      <span className="text-sm font-black text-slate-800">{jubahStats.modeCounts[row.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
              </>)}
            </div>

            {/* Customer | Rider | Price sub-tabs */}
            <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1 overflow-x-auto no-scrollbar">
              {([
                { id: 'rider',    label: 'Rider',    superadminOnly: false },
                { id: 'customer', label: 'Customer Directory', superadminOnly: false },
                { id: 'customer_details', label: 'Customer Details', superadminOnly: false },
                { id: 'price',    label: 'Price',    superadminOnly: true },
                { id: 'faculty',  label: 'Faculty',  superadminOnly: false },
                { id: 'banner',   label: 'Banner',   superadminOnly: false },
              ] as const)
                .filter(t => !t.superadminOnly || isSuperAdmin)
                .map(t => (
                // Same opacity-overlay technique as the mobile admin tab
                // bar above — see its comment for why (WebView repaint bug).
                <button key={t.id} onClick={() => { setJubahSubTab(t.id); setJubahAdminView('list'); setJubahAdminSelected(null); }}
                  className="relative flex-1 min-w-[7.5rem] rounded-xl transition-transform transform-gpu">
                  <span className="block py-2 text-xs font-semibold text-slate-400">{t.label}</span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                      jubahSubTab === t.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </>)}

          {/* ── RIDER sub-tab ── */}
          {effectiveJubahSubTab === 'rider' && (
            <JubahRiderSubTab
              ref={jubahRiderTabRef}
              active={activeTab === 'jubah' && effectiveJubahSubTab === 'rider'}
              isSuperAdmin={isSuperAdmin}
              adminCampus={adminCampus}
              jubahUniversityView={jubahUniversityView}
              showToast={showToast}
              onModalOpenChange={setJubahRiderModalOpen}
            />
          )}

          {/* -- CUSTOMER sub-tab -- */}
          {effectiveJubahSubTab === 'customer' && (
            <JubahCustomerSubTab
              active={activeTab === 'jubah' && effectiveJubahSubTab === 'customer'}
              isSuperAdmin={isSuperAdmin}
              bookings={jubahBookings}
              bookingsTotalCount={jubahBookingsTotalCount}
              bookingsLoading={jubahBookingsLoading}
              setBookings={setJubahBookings}
              reload={loadJubahData}
              adminView={jubahAdminView}
              selected={jubahAdminSelected}
              setSelected={setJubahAdminSelected}
              onGoToCard={goToAdminCard}
              onGoBack={goAdminBack}
              onGoToList={goToJubahList}
              showToast={showToast}
              onModalOpenChange={setJubahCustomerModalOpen}
              universityLabel={jubahUniversityLabel}
            />
          )}

          {/* -- CUSTOMER DETAILS sub-tab -- */}
          {effectiveJubahSubTab === 'customer_details' && (
            <JubahCustomerDetailsSubTab
              active={activeTab === 'jubah' && effectiveJubahSubTab === 'customer_details'}
              bookings={jubahBookings}
              bookingsTotalCount={jubahBookingsTotalCount}
              bookingsLoading={jubahBookingsLoading}
              reload={loadJubahData}
              showToast={showToast}
              universityKey={isSuperAdmin ? jubahUniversityView : (universityKeyFromCampus(adminCampus) ?? 'umpsa')}
              universityLabel={jubahUniversityLabel}
            />
          )}

          {/* ── PRICE sub-tab — superadmin only (rider commission RM
              amounts + bank/QR payment details) ── */}
          {effectiveJubahSubTab === 'price' && isSuperAdmin && (
            <JubahPriceSubTab
              active={activeTab === 'jubah' && effectiveJubahSubTab === 'price'}
              isSuperAdmin={isSuperAdmin}
              showToast={showToast}
              jubahUniversity={jubahUniversityView}
            />
          )}

          {effectiveJubahSubTab === 'faculty' && (
            <JubahFacultySubTab
              active={activeTab === 'jubah' && effectiveJubahSubTab === 'faculty'}
              universityKey={isSuperAdmin ? jubahUniversityView : (universityKeyFromCampus(adminCampus) ?? 'umpsa')}
              universityLabel={jubahUniversityLabel}
              showToast={showToast}
            />
          )}

          {/* ── BANNER sub-tab ── */}
          {jubahSubTab === 'banner' && (
            <JubahBannerSubTab
              active={activeTab === 'jubah' && jubahSubTab === 'banner'}
              onOpenSampleDocs={setSampleDocsPage}
              showToast={showToast}
            />
          )}
        </div>
      )}

      {/* ── RECEIPTS TAB (superadmin only) ── */}
      {activeTab === 'receipts' && user.role === 'superadmin' && (
        <ReceiptsTab
          ref={receiptsTabRef}
          active={activeTab === 'receipts'}
          showToast={showToast}
          onViewProfile={setSheetUser}
          onModalOpenChange={setReceiptsModalOpen}
        />
      )}

      {/* ── EARNINGS TAB (superadmin only) ── */}
      {activeTab === 'earnings' && user.role === 'superadmin' && (
        <EarningsTab
          ref={earningsTabRef}
          active={activeTab === 'earnings'}
        />
      )}

      {/* ── ACTIVITY LOG TAB (superadmin only) ── */}
      {activeTab === 'activity' && user.role === 'superadmin' && (
        <ActivityLogTab
          ref={activityTabRef}
          active={activeTab === 'activity'}
        />
      )}

      {/* ── CALENDAR TAB ── */}
      {activeTab === 'calendar' && (
        <CalendarTab
          ref={calendarTabRef}
          active={activeTab === 'calendar'}
          showToast={showToast}
        />
      )}

      </>)}

    </div>
      </div>
      {/* close content pane */}
    </div>
    {/* close outer desktop-shell / mobile-column wrapper */}

    </>
  );
};
