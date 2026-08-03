import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../lib/supabase';
import { INACTIVITY_LIMIT_MS, isSessionExpired, touchActivity, setSessionExpiredMessage } from '../lib/idleSession';

// window.location.origin on web — always correct wherever the app is
// actually being served from (gerakmy.com in production, localhost during
// dev) rather than Supabase's dashboard-configured Site URL fallback, which
// still points at an old Vercel deployment URL (same issue ForgotPassword.tsx
// already fixed for password-reset emails; signUp() never got the same fix).
const authRedirectUrl = () =>
  Capacitor.isNativePlatform() ? 'https://www.gerakmy.com' : window.location.origin;

// Definitions
export type ActivePage =
  | 'splash'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'transport'
  | 'jubah'
  | 'profile'
  | 'notifications'
  | 'driver-home'
  | 'rider-home'
  | 'admin-home'
  | 'my-orders'
  | 'activity'
  | 'gerak-rental'
  | 'academic-calendar'
  | 'forgot-password'
  | 'reset-password'
  | 'track-jubah'
  | 'gerak-transporter'
  | 'privacy-policy'
  | 'terms-of-service'
  | 'repaint-repro';

export interface UserSession {
  name: string;
  matricNo: string;
  email: string;
  phone: string;
  university: string;
  campus: string;
  gerakId: string;
  role: string;
  status: string;
  vehicle: string;
  plateNumber: string;
  feeReceiptUrl: string;
  feeReceiptVerified: boolean;
  feeReceiptAmount: string;
  feeReceiptDate: string;
  feeReceiptExpiry: string;
  feeReceiptRejectReason: string;
  canDrive: boolean;
  canRent: boolean;
  canTransport: boolean;
  icNumber: string;
  icUrl: string;
  licenseUrl: string;
  avatarUrl: string;
  docsStatus: 'none' | 'pending' | 'approved' | 'rejected';
  docsRejectReason: string;
  receiptGateExempt: boolean;
  isLoggedIn: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  isRead: boolean;
  type: 'system' | 'transport' | 'jubah';
}

export interface DriverDetails {
  name: string;
  rating: number;
  vehicle: string;
  plateNumber: string;
  phone: string;
  lat: number;
  lng: number;
}

export type TransportStep = 'idle' | 'searching' | 'assigned' | 'arriving' | 'active' | 'completed';

export interface RideBooking {
  id: string;
  pickup: string;
  destination: string;
  fare: number;
  date: string;
  driver?: DriverDetails;
  status: TransportStep;
}

export interface JubahBooking {
  reference: string;
  fullName: string;
  icNumber: string;
  hpNumber: string;
  email: string;
  university: string;
  faculty: string;
  matricId: string;
  paymentMode: 'pickup' | 'postage' | 'deposit';
  remark: 'Master' | 'PHD' | 'Degree' | 'Diploma';
  combinedFileName: string;
  cost: number;
  balanceDue: number;
  status: string;
  deliveryAddress?: string;
  returnScheduled: boolean;
  returnMethod?: 'self' | 'locker' | 'courier';
  returnDate?: string;
  returnTime?: string;
  riderId?: string;
}

export interface ConfirmModalOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AppContextType {
  // Navigation & Session
  currentPage: ActivePage;
  setCurrentPage: (page: ActivePage) => void;
  goBack: () => void;
  canGoBack: boolean;
  deepLinkPage: ActivePage | null;
  setLeaveGuard: (guard: (() => void) | null) => void;
  isPreviewMode: boolean;
  enterPreviewMode: () => void;
  exitPreviewMode: () => void;
  activeRole: 'admin' | 'driver' | 'rider' | null;
  switchToDriverMode: () => void;
  switchToAdminMode: () => void;
  switchToRiderMode: () => void;
  user: UserSession;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  register: (name: string, matricNo: string, email: string, password: string, phone: string, university: string, campus: string, agreedToTerms: boolean) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  logout: () => void;
  updateProfile: (updates: { name?: string; matricNo?: string; email?: string; phone?: string; vehicle?: string; plateNumber?: string; icNumber?: string; feeReceiptUrl?: string; avatarUrl?: string; campus?: string }) => Promise<{ error: string | null }>;
  refreshUserData: () => Promise<void>;
  receiptGateActive: boolean;
  isSheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  profileEditIntentRef: { current: boolean };
  confirmModal: ConfirmModalOptions | null;
  showConfirmModal: (opts: ConfirmModalOptions) => void;
  hideConfirmModal: () => void;
  showAuthGate: () => void;
  guestCampus: string;
  setGuestCampus: (campus: string) => void;

  // Notifications
  notifications: NotificationItem[];
  addNotification: (title: string, description: string, type: NotificationItem['type']) => void;
  markAllNotificationsRead: () => void;

  // Transport Module
  activeRide: RideBooking | null;

  // Jubah Delivery Module
  jubahBooking: JubahBooking | null;
  bookJubah: (reference: string, fullName: string, icNumber: string, hpNumber: string, university: string, faculty: string, matricId: string, paymentMode: 'pickup' | 'postage' | 'deposit', remark: 'Master' | 'PHD' | 'Degree' | 'Diploma', combinedFileName: string, depositMethod: 'pickup' | 'postage' | undefined, postageZone: 'SM' | 'SS' | undefined, riderId?: string, riderName?: string, campus?: string, deliveryAddress?: string, docsPath?: string, oscarPath?: string, skpgPath?: string, konvoPath?: string, icPath?: string, universityKey?: string, email?: string, paymentPath?: string) => Promise<{ success: boolean; error?: string; code?: string; booking?: JubahBooking }>;
  commitJubahBooking: (booking: JubahBooking) => void;
  scheduleReturn: (method: 'self' | 'locker' | 'courier', date: string, time: string) => void;
  cancelJubahBooking: () => void;
  startNewJubahBooking: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Navigation & Session
  const [currentPage, _setCurrentPage] = useState<ActivePage>('splash');
  // ToyyibPay's billReturnUrl points at /jubah/track — this is a client-routed
  // SPA (vercel.json rewrites every path to index.html, and nothing else ever
  // reads location.pathname), so without this, a customer redirected back
  // after paying would boot straight past that URL into the normal splash →
  // dashboard flow and never see their booking status. Captured once, before
  // Splash's own timer can navigate away from it.
  const [deepLinkPage] = useState<ActivePage | null>(() => {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path.endsWith('/jubah/track')) return 'track-jubah';
    // Standalone marketing link (posters, WhatsApp shares, etc.) — lands
    // guests straight on the Jubah landing/university picker without
    // needing to log in or navigate from the dashboard first. Checked
    // before the /jubah/track case above would ever conflict — this only
    // matches a path ending in exactly "/jubah", not "/jubah/track".
    if (path.endsWith('/jubah')) return 'jubah';
    // Privacy Policy / Terms need a stable, publicly reachable URL — required
    // for app store submission and just generally expected — not just an
    // in-app-only screen. Same deep-link mechanism as /jubah/track above.
    if (path.endsWith('/privacy')) return 'privacy-policy';
    if (path.endsWith('/terms')) return 'terms-of-service';
    // Minimal, auth-free reproduction page for a real repaint bug filed
    // against Chromium/Android WebView — see RepaintRepro.tsx.
    if (path.endsWith('/repro')) return 'repaint-repro';
    // The staff-invite email's "Create Your Account" button links here —
    // lands the invitee straight on the register form instead of the
    // splash/dashboard, with their invited email prefilled (Register.tsx
    // reads the same ?email= param straight off window.location.search).
    if (path.endsWith('/register')) return 'register';
    return null;
  });
  const [pageHistory, setPageHistory] = useState<ActivePage[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [activeRole, setActiveRole] = useState<'admin' | 'driver' | 'rider' | null>(null);

  const HISTORY_EXCLUDED: ActivePage[] = ['splash'];
  const HOME_PAGES: ActivePage[] = ['dashboard', 'driver-home', 'rider-home', 'admin-home', 'login', 'profile', 'academic-calendar', 'activity'];

  const setCurrentPage = (page: ActivePage) => {
    if (HOME_PAGES.includes(page)) {
      setPageHistory([]);
    } else if (!HISTORY_EXCLUDED.includes(currentPage)) {
      setPageHistory(prev => [...prev, currentPage]);
    }
    _setCurrentPage(page);
  };

  // Lets the current page intercept back-navigation (e.g. to confirm
  // discarding unsaved input) instead of leaving immediately. Only one
  // page can hold the guard at a time — it registers on mount and clears
  // it on unmount, so leftover guards from a previous page never linger.
  const [leaveGuard, setLeaveGuard] = useState<(() => void) | null>(null);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  useEffect(() => { leaveGuardRef.current = leaveGuard; }, [leaveGuard]);

  const goBack = () => {
    if (leaveGuardRef.current) { leaveGuardRef.current(); return; }
    setPageHistory(prev => {
      if (prev.length === 0) return prev;
      _setCurrentPage(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  };

  // Android back button — intercept system popstate so the PWA doesn't close.
  // On native, this ALSO needs @capacitor/app's own backButton event: the
  // hardware/gesture back button is handled by Android before it reaches the
  // WebView, and a WebView built purely from pushState() calls (never a real
  // URL change) doesn't reliably register as "has history to go back to" —
  // so without this, Android's own fallback kicks in and just exits the app,
  // completely bypassing the popstate trap below.
  const pageHistoryRef = useRef(pageHistory);
  useEffect(() => { pageHistoryRef.current = pageHistory; }, [pageHistory]);
  useEffect(() => {
    // A leave guard means there is definitely something for back to do
    // (close an overlay, cancel a form, etc.) even when pageHistory is
    // empty — e.g. a page reached as the very first screen of the session
    // (a deep link) that then opens its own in-page overlay. Checking only
    // pageHistory.length here missed that case entirely.
    const hasSomewhereToGo = () => pageHistoryRef.current.length > 0 || !!leaveGuardRef.current;

    window.history.pushState(null, '');
    const handlePopState = () => {
      // Dismissing the on-screen keyboard can also fire popstate on some
      // mobile browsers — treat that as "close the keyboard," not a real
      // back-press, so it doesn't spuriously trigger a page's leave-guard
      // (e.g. Jubah's "Discard this booking?") while someone is just typing.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        active.blur();
        window.history.pushState(null, '');
        return;
      }
      if (hasSomewhereToGo()) {
        goBack();
      }
      // Always re-push so the browser never runs out of history entries
      window.history.pushState(null, '');
    };
    window.addEventListener('popstate', handlePopState);

    let removeNativeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          active.blur();
          return;
        }
        if (hasSomewhereToGo()) {
          goBack();
        } else {
          // Truly at the root with nothing to intercept — exit, matching
          // standard Android back-button convention, instead of leaving the
          // press to fall through to whatever Android's own default is.
          CapacitorApp.exitApp();
        }
      }).then(handle => { removeNativeListener = () => handle.remove(); });
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      removeNativeListener?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global receipt gate — fetched once on mount, controlled by superadmin
  const [receiptGateActive, setReceiptGateActive] = useState(true);

  // Shared "is any bottom sheet/modal open" flag — BottomNav hides itself
  // while true, sidestepping any device-specific stacking-context quirks
  // where a fixed-position sheet might not reliably paint above it.
  //
  // Backed by a count, not a plain boolean, because sheets can nest (e.g. a
  // <Dropdown> rendered inside an already-open sheet) — a boolean would let
  // the inner one's "close" call clobber the outer one's "open" call. Every
  // caller MUST report through the guarded-effect pattern so opens/closes
  // stay paired 1:1:
  //   useEffect(() => {
  //     if (!condition) return;      // do nothing while never open
  //     setSheetOpen(true);
  //     return () => setSheetOpen(false);
  //   }, [condition, setSheetOpen]);
  // Never call setSheetOpen(false) without a prior matching setSheetOpen(true)
  // from that same effect/handler pair — an unpaired call desyncs the count.
  const [openSheetCount, setOpenSheetCount] = useState(0);
  const isSheetOpen = openSheetCount > 0;
  const setSheetOpen = useCallback((open: boolean) => {
    setOpenSheetCount(c => Math.max(0, c + (open ? 1 : -1)));
  }, []);

  // One-shot "open straight into the edit sub-page" signal for Profile.tsx,
  // set by Header.tsx right before navigating there. A ref (not state) since
  // it only needs to be read once during Profile's initial mount, never to
  // trigger a re-render itself.
  const profileEditIntentRef = useRef(false);

  const [confirmModal, setConfirmModal] = useState<ConfirmModalOptions | null>(null);
  const showConfirmModal = (opts: ConfirmModalOptions) => setConfirmModal(opts);
  const hideConfirmModal = () => setConfirmModal(null);
  const showAuthGate = () => setConfirmModal({
    title: 'Login Required',
    message: 'Sign in to book rides and access all Gerak services.',
    onConfirm: () => { setConfirmModal(null); _setCurrentPage('login'); },
  });
  const [guestCampus, setGuestCampus] = useState('');
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'receipt_gate_active').single()
      .then(({ data }) => { if (data) setReceiptGateActive(data.value === 'true'); });
  }, []);

  const [user, setUser] = useState<UserSession>({
    name: '',
    matricNo: '',
    email: '',
    phone: '',
    university: '',
    campus: '',
    gerakId: '',
    role: 'customer',
    status: 'active',
    vehicle: '',
    plateNumber: '',
    feeReceiptUrl: '',
    feeReceiptVerified: false,
    feeReceiptAmount: '',
    feeReceiptDate: '',
    feeReceiptExpiry: '',
    feeReceiptRejectReason: '',
    canDrive: false,
    canRent:  false,
    canTransport: false,
    icNumber: '',
    icUrl: '',
    licenseUrl: '',
    docsStatus: 'none',
    docsRejectReason: '',
    receiptGateExempt: false,
    avatarUrl: '',
    isLoggedIn: false,
  });

  // Notifications — previously seeded with two hardcoded fake items shown
  // to every single user regardless of anything they'd actually done
  // ("Welcome to gerak!", a "Graduation Notice 2026" that only made sense
  // for one particular convocation). Combined with notifications never
  // being persisted anywhere, this meant every fresh session/reload showed
  // exactly the same phantom "1 unread" badge forever, whether or not
  // there was ever anything real to read. Starts empty now — real events
  // populate it as they actually happen (see addNotification call sites).
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // One-time "we updated our Privacy Policy / Terms" nudge — fires once per
  // browser per version bump (tracked in localStorage, independent of
  // login, since guests can read these too), not once per session, since
  // the in-memory notifications list itself resets on every reload anyway.
  // Bump POLICY_NOTICE_VERSION whenever PrivacyPolicy.tsx/TermsOfService.tsx
  // meaningfully change.
  useEffect(() => {
    const POLICY_NOTICE_VERSION = '2026-07-25';
    const key = 'gerak_policy_version_seen';
    try {
      if (localStorage.getItem(key) !== POLICY_NOTICE_VERSION) {
        addNotification(
          'Privacy Policy & Terms Updated',
          'We\'ve updated our Privacy Policy and Terms of Service. Tap to review what changed.',
          'system',
        );
        localStorage.setItem(key, POLICY_NOTICE_VERSION);
      }
    } catch { /* localStorage unavailable — skip silently, same as elsewhere in this file */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transport Module
  const [activeRide, setActiveRide] = useState<RideBooking | null>(null);

  // Jubah Delivery — persisted to localStorage so booking survives app restarts
  const [jubahBooking, setJubahBooking] = useState<JubahBooking | null>(() => {
    try {
      const saved = localStorage.getItem('gerak_jubah_booking');
      return saved ? (JSON.parse(saved) as JubahBooking) : null;
    } catch { return null; }
  });
  useEffect(() => {
    if (jubahBooking) localStorage.setItem('gerak_jubah_booking', JSON.stringify(jubahBooking));
    else localStorage.removeItem('gerak_jubah_booking');
  }, [jubahBooking]);

  // ── Inactivity/session-expiry tracking ──────────────────────────────
  // isLoggingOutRef distinguishes an explicit logout() call from the
  // session silently dying (token revoked/expired) so we only show the
  // "session expired" message in the latter case.
  const isLoggingOutRef = useRef(false);
  const userLoggedInRef = useRef(false);
  useEffect(() => { userLoggedInRef.current = user.isLoggedIn; }, [user.isLoggedIn]);

  // Track activity while logged in so isSessionExpired() has a fresh timestamp.
  useEffect(() => {
    if (!user.isLoggedIn) return;
    touchActivity();
    const handler = () => touchActivity();
    window.addEventListener('pointerdown', handler, { passive: true });
    window.addEventListener('keydown', handler, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [user.isLoggedIn]);

  // ── Supabase: restore session on app load ──────────────────────────
  useEffect(() => {
    const isRecovery = window.location.hash.includes('type=recovery');
    // Same hash-based artifact as isRecovery above — clicking the "Confirm
    // your email" link lands here with a real, already-valid session (this
    // project uses Supabase's implicit auth flow, same as the recovery
    // link), not just a "you're verified, now go log in" marker. Detected
    // once on this same initial-load check so the welcome notification
    // fires exactly once, not on every subsequent session restore.
    const isEmailConfirmation = window.location.hash.includes('type=signup');

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user || isRecovery) return;
      if (isSessionExpired(INACTIVITY_LIMIT_MS)) {
        supabase.auth.signOut();
        setSessionExpiredMessage();
        return;
      }
      if (isEmailConfirmation) {
        addNotification('Email confirmed ✓', 'Your Gerak account is now verified — welcome aboard!', 'system');
      }
      applyPendingInviteIfAny().then(() => loadProfile(session.user.id));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageHistory([]);
        _setCurrentPage('reset-password');
        return;
      }
      if (!session) {
        const wasLoggedIn = userLoggedInRef.current;
        const manualLogout = isLoggingOutRef.current;
        isLoggingOutRef.current = false;
        setUser(prev => ({ ...prev, isLoggedIn: false }));
        if (wasLoggedIn && !manualLogout) {
          setSessionExpiredMessage();
          setPageHistory([]);
          _setCurrentPage('login');
        }
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picks up a driver_invites row that was created for this email AFTER
  // the account already existed — handle_new_user() only ever applies an
  // invite at the moment a brand-new auth.users row is inserted, so an
  // existing account (typically a 'customer' invited to also become a
  // rider/driver) has no other path to ever receive it. Must be awaited
  // and finish before loadProfile() runs, since loadProfile both sets
  // user state and does role-based routing in the same pass — applying
  // the promotion after that would show the stale pre-promotion role for
  // this particular load.
  const applyPendingInviteIfAny = async () => {
    const { data, error } = await supabase.rpc('apply_pending_invite');
    if (error || !data?.applied) return;
    const roleLabel = data.role === 'rider' ? 'Rider' : data.role === 'driver' ? 'Driver' : 'Admin';
    addNotification(
      `You now have ${roleLabel} access`,
      `An admin granted you ${roleLabel} access for UMPSA ${data.campus}. Explore your new tab to get started.`,
      'system',
    );
  };

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id,name,matric_no,email,phone,university,campus,gerak_id,role,status,vehicle,plate_number,fee_receipt_url,fee_receipt_verified,fee_receipt_amount,fee_receipt_date,fee_receipt_expiry,fee_receipt_reject_reason,can_drive,can_rent,can_transport,ic_number,ic_url,license_url,docs_status,docs_reject_reason,receipt_gate_exempt,avatar_url').eq('id', userId).single();
    if (data) {
      const role = data.role ?? 'customer';
      setUser({
        name:          data.name,
        matricNo:      data.matric_no,
        email:         data.email,
        phone:         data.phone           ?? '',
        university:    data.university      ?? '',
        campus:        data.campus          ?? '',
        gerakId:       data.gerak_id        ?? '',
        role,
        status:        data.status          ?? 'active',
        vehicle:                data.vehicle                  ?? '',
        plateNumber:            data.plate_number             ?? '',
        feeReceiptUrl:          data.fee_receipt_url          ?? '',
        feeReceiptVerified:     data.fee_receipt_verified     ?? false,
        feeReceiptAmount:       data.fee_receipt_amount       ?? '',
        feeReceiptDate:         data.fee_receipt_date         ?? '',
        feeReceiptExpiry:       data.fee_receipt_expiry       ?? '',
        feeReceiptRejectReason: data.fee_receipt_reject_reason ?? '',
        canDrive:               data.can_drive ?? (data.role === 'driver'),
        canRent:                data.can_rent  ?? false,
        canTransport:           data.can_transport ?? false,
        icNumber:               data.ic_number ?? '',
        icUrl:                  data.ic_url           ?? '',
        licenseUrl:             data.license_url      ?? '',
        docsStatus:             data.docs_status      ?? 'none',
        docsRejectReason:       data.docs_reject_reason ?? '',
        receiptGateExempt:      data.receipt_gate_exempt ?? false,
        avatarUrl:              data.avatar_url ?? '',
        isLoggedIn:             true,
      });
      setPageHistory([]);
      // 'register' is deliberately excluded here — unlike /jubah/track,
      // /privacy, /terms (genuinely "take me back to this page after
      // auth"), deepLinkPage never gets cleared once set, so reaching
      // this same loadProfile() call right after a SUCCESSFUL
      // registration — which is exactly what always happens next — kept
      // bouncing the user straight back to the form they just completed,
      // instead of their real role-based home. Confirmed live: the
      // account was created correctly every time: this redirect, not
      // registration itself, was the actual bug.
      if (deepLinkPage && deepLinkPage !== 'register') {
        _setCurrentPage(deepLinkPage);
      } else if (role === 'driver') {
        _setCurrentPage('driver-home');
        // ── Fee expiry reminder (once per session) ───────────────
        const expiry    = data.fee_receipt_expiry ? new Date(data.fee_receipt_expiry) : null;
        const verified  = data.fee_receipt_verified ?? false;
        const sessionKey = `gerak_reminder_${userId}`;
        const today      = new Date().toDateString();
        if (expiry && verified && localStorage.getItem(sessionKey) !== today) {
          localStorage.setItem(sessionKey, today);
          const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
          const expiryLabel = expiry.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
          if (daysLeft <= 0) {
            setNotifications(prev => [{
              id: `fee-expired-${Date.now()}`, title: '🔴 Monthly Fee Expired',
              description: `Your Gerak account is now inactive. Pay RM25 to MUHAMMAD ATIF DANIEL and upload your receipt to reactivate.`,
              time: 'Just now', isRead: false, type: 'system' as const,
            }, ...prev]);
          } else if (daysLeft <= 3) {
            setNotifications(prev => [{
              id: `fee-reminder-${Date.now()}`, title: `⚠️ Fee Due in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`,
              description: `Your account expires on ${expiryLabel}. Pay RM25 to MUHAMMAD ATIF DANIEL on 1st–3rd of the month to stay active.`,
              time: 'Just now', isRead: false, type: 'system' as const,
            }, ...prev]);
          }
        }
      } else if (role === 'rider') {
        _setCurrentPage('rider-home');
      } else if (role === 'superadmin' || role === 'admin') {
        setActiveRole('admin');
        _setCurrentPage('admin-home');
      } else {
        setActiveRole(null);
        _setCurrentPage('dashboard');
      }
    }
  };


  // 1. Session Operations
  const login = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await applyPendingInviteIfAny();
      await loadProfile(authUser.id);
    }
    return { error: null };
  };

  const register = async (name: string, matricNo: string, email: string, password: string, phone: string, university: string, campus: string, agreedToTerms: boolean): Promise<{ error: string | null; needsConfirmation?: boolean }> => {
    if (!agreedToTerms) return { error: 'Please agree to the Terms & Conditions and Privacy Policy.' };
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, matric_no: matricNo.toUpperCase(), phone, university, campus },
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (error) return { error: error.message };
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      // Email confirmation is required project-wide — signUp() succeeds and
      // creates the row, but this immediate sign-in attempt always fails
      // until the user clicks the link Supabase just emailed them. Distinct
      // from a real failure: the account genuinely was created, it's just
      // not usable yet, so the UI needs to say that instead of "please sign
      // in" (which would just fail again with the same error).
      if (signInErr.message.toLowerCase().includes('email not confirmed')) {
        return { error: null, needsConfirmation: true };
      }
      return { error: 'Account created, but automatic sign-in failed. Please try signing in manually.' };
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await supabase.from('profiles').update({ phone, university, campus, terms_accepted_at: new Date().toISOString() }).eq('id', authUser.id);
      await loadProfile(authUser.id);
    }
    return { error: null };
  };

  const refreshUserData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data } = await supabase.from('profiles').select('id,name,matric_no,email,phone,university,campus,gerak_id,role,status,vehicle,plate_number,fee_receipt_url,fee_receipt_verified,fee_receipt_amount,fee_receipt_date,fee_receipt_expiry,fee_receipt_reject_reason,can_drive,can_rent,can_transport,ic_number,ic_url,license_url,docs_status,docs_reject_reason,receipt_gate_exempt,avatar_url').eq('id', authUser.id).single();
    if (data) {
      setUser(prev => ({
        ...prev,
        feeReceiptUrl:          data.fee_receipt_url           ?? '',
        feeReceiptVerified:     data.fee_receipt_verified      ?? false,
        feeReceiptAmount:       data.fee_receipt_amount        ?? '',
        feeReceiptDate:         data.fee_receipt_date          ?? '',
        feeReceiptExpiry:       data.fee_receipt_expiry        ?? '',
        feeReceiptRejectReason: data.fee_receipt_reject_reason ?? '',
        icNumber:         data.ic_number         ?? '',
        icUrl:            data.ic_url            ?? '',
        licenseUrl:       data.license_url       ?? '',
        docsStatus:       data.docs_status       ?? 'none',
        docsRejectReason: data.docs_reject_reason ?? '',
        receiptGateExempt: data.receipt_gate_exempt ?? false,
        avatarUrl:        data.avatar_url ?? '',
        status:           data.status            ?? 'active',
      }));
    }
  };

  const updateProfile = async (updates: { name?: string; matricNo?: string; email?: string; phone?: string; vehicle?: string; plateNumber?: string; icNumber?: string; feeReceiptUrl?: string; avatarUrl?: string; campus?: string }): Promise<{ error: string | null }> => {
    let { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      authUser = refreshed?.user ?? null;
    }
    if (!authUser) return { error: 'Session expired — please log out and log in again.' };
    const row: Record<string, string> = {};
    if (updates.name           !== undefined) row.name            = updates.name;
    if (updates.matricNo       !== undefined) row.matric_no       = updates.matricNo;
    if (updates.email          !== undefined) row.email           = updates.email;
    if (updates.phone          !== undefined) row.phone           = updates.phone;
    if (updates.vehicle        !== undefined) row.vehicle         = updates.vehicle;
    if (updates.plateNumber    !== undefined) row.plate_number    = updates.plateNumber;
    if (updates.icNumber       !== undefined) row.ic_number       = updates.icNumber;
    if (updates.avatarUrl      !== undefined) row.avatar_url      = updates.avatarUrl;
    if (updates.feeReceiptUrl  !== undefined) row.fee_receipt_url = updates.feeReceiptUrl;
    if (updates.campus         !== undefined) row.campus          = updates.campus;
    const { error } = await supabase.from('profiles').update(row).eq('id', authUser.id);
    if (error) return { error: error.message };
    setUser(prev => ({ ...prev, ...updates }));
    return { error: null };
  };


  const switchToDriverMode = () => {
    setIsPreviewMode(false);
    setActiveRole('driver');
    setPageHistory([]);
    _setCurrentPage('driver-home');
  };

  const switchToAdminMode = () => {
    setIsPreviewMode(false);
    setActiveRole('admin');
    setPageHistory([]);
    _setCurrentPage('admin-home');
  };

  const switchToRiderMode = () => {
    setIsPreviewMode(false);
    setActiveRole('rider');
    setPageHistory([]);
    _setCurrentPage('rider-home');
  };

  const enterPreviewMode = () => {
    setIsPreviewMode(true);
    setPageHistory([]);
    _setCurrentPage('dashboard');
  };

  const exitPreviewMode = () => {
    setIsPreviewMode(false);
    setPageHistory([]);
    if (user.role === 'driver') _setCurrentPage('driver-home');
    else if (user.role === 'admin' || user.role === 'superadmin') _setCurrentPage('admin-home');
    else _setCurrentPage('dashboard');
  };

  const logout = () => {
    isLoggingOutRef.current = true;
    setPageHistory([]);
    setActiveRole(null);
    setIsPreviewMode(false);
    setUser({ name: '', matricNo: '', email: '', phone: '', university: '', campus: '', gerakId: '', role: 'customer', status: 'active', vehicle: '', plateNumber: '', feeReceiptUrl: '', feeReceiptVerified: false, feeReceiptAmount: '', feeReceiptDate: '', feeReceiptExpiry: '', feeReceiptRejectReason: '', canDrive: false, canRent: false, canTransport: false, icNumber: '', icUrl: '', licenseUrl: '', docsStatus: 'none', docsRejectReason: '', receiptGateExempt: false, avatarUrl: '', isLoggedIn: false });
    setActiveRide(null);
    setJubahBooking(null);
    _setCurrentPage('login');
    supabase.auth.signOut();
  };

  // Re-check the inactivity limit periodically while the app stays open, so a
  // tab left open continuously (never reloaded) still gets force-logged-out
  // once past the limit, not just on next app load.
  useEffect(() => {
    if (!user.isLoggedIn) return;
    const intervalId = window.setInterval(() => {
      if (isSessionExpired(INACTIVITY_LIMIT_MS)) {
        setSessionExpiredMessage();
        logout();
      }
    }, 15 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.isLoggedIn]);


  // 2. Notification Operations
  const addNotification = (title: string, description: string, type: NotificationItem['type']) => {
    const newNotif: NotificationItem = {
      id: Date.now().toString(),
      title,
      description,
      time: 'Just now',
      isRead: false,
      type
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  // 3. Jubah Delivery Operations
  // Awaits the persistence RPC before confirming, so a failed save never
  // shows the customer a false "Booking Confirmed" screen (previously
  // fire-and-forget — the confirmation showed regardless of RPC outcome).
  const bookJubah = async (
    reference: string,
    fullName: string,
    icNumber: string,
    hpNumber: string,
    university: string,
    faculty: string,
    matricId: string,
    paymentMode: 'pickup' | 'postage' | 'deposit',
    remark: 'Master' | 'PHD' | 'Degree' | 'Diploma',
    combinedFileName: string,
    depositMethod: 'pickup' | 'postage' | undefined,
    postageZone: 'SM' | 'SS' | undefined,
    riderId?: string,
    riderName?: string,
    campus?: string,
    deliveryAddress?: string,
    docsPath?: string,
    oscarPath?: string,
    skpgPath?: string,
    konvoPath?: string,
    icPath?: string,
    universityKey?: string,
    email?: string,
    paymentPath?: string,
  ): Promise<{ success: boolean; error?: string; code?: string; booking?: JubahBooking }> => {
    if (!campus) return { success: false, error: 'Missing campus information.' };

    const { data: { user: authUser } } = await supabase.auth.getUser();
    // cost/balance_due aren't sent — create_jubah_booking computes them
    // itself from jubah_pricing so a tampered request can't get an
    // admin-facing price mismatch between what's shown and what's owed.
    const { data, error } = await supabase.rpc('create_jubah_booking', {
      p_reference:         reference,
      p_full_name:         fullName,
      p_ic_number:         icNumber,
      p_hp_number:         hpNumber,
      p_matric_id:         matricId,
      p_university:        university,
      p_campus:            campus,
      p_faculty:           faculty,
      p_remark:            remark,
      p_payment_mode:      paymentMode,
      p_deposit_method:    depositMethod ?? null,
      p_postage_zone:      postageZone   ?? null,
      p_rider_id:          riderId         ?? null,
      p_rider_name:        riderName       ?? null,
      p_delivery_address:  deliveryAddress ?? null,
      p_docs_path:    docsPath    ?? null,
      p_payment_path: paymentPath ?? null,
      p_oscar_path:   oscarPath   ?? null,
      p_skpg_path:    skpgPath    ?? null,
      p_konvo_path:   konvoPath   ?? null,
      p_ic_path:      icPath      ?? null,
      p_customer_id:       authUser?.id    ?? null,
      p_university_key:    universityKey   ?? 'umpsa',
      p_email:             email ?? null,
    });

    if (error || !data?.success) {
      console.error('[GERAK] Booking save failed:', error ?? data?.error);
      return { success: false, error: (data?.error as string) ?? 'Could not save your booking. Please try again.', code: data?.code as string | undefined };
    }

    const cost       = Number(data.cost);
    const balanceDue = Number(data.balance_due);

    const newBooking: JubahBooking = {
      reference,
      fullName,
      icNumber,
      hpNumber,
      email: email ?? '',
      university,
      faculty,
      matricId,
      paymentMode,
      remark,
      combinedFileName,
      cost,
      balanceDue,
      status: 'ordered',
      deliveryAddress,
      returnScheduled: false,
      riderId,
    };

    // Deliberately does NOT call setJubahBooking here — the caller (Jubah.tsx)
    // only commits this to the Reservation Active view after attempting the
    // ToyyibPay redirect, so a customer who's about to be sent straight to
    // FPX never sees a "confirmed"-looking receipt screen flash by first.
    addNotification('Robe Booking Confirmed', `Booking for ${fullName} (${remark}) confirmed. Service fee: RM${cost.toFixed(2)}.`, 'jubah');
    return { success: true, booking: newBooking };
  };

  const scheduleReturn = (method: 'self' | 'locker' | 'courier', date: string, time: string) => {
    if (!jubahBooking) return;
    setJubahBooking(prev => prev ? {
      ...prev,
      returnScheduled: true,
      returnMethod: method,
      returnDate: date,
      returnTime: time
    } : null);
    addNotification('Return Scheduled', `Robe return booking via ${method.toUpperCase()} set for ${date} at ${time}.`, 'jubah');
  };

  const cancelJubahBooking = () => {
    if (jubahBooking) {
      setJubahBooking(null);
      addNotification('Booking Cancelled', 'Convocation robe order cancelled.', 'jubah');
    }
  };

  // Forgets the current booking in this browser only — the existing booking
  // stays exactly as-is in the database (still trackable via reference /
  // matric / IC), this just clears the way to start a second one.
  const startNewJubahBooking = () => setJubahBooking(null);

  // Reveals the Reservation Active / receipt view — called only after the
  // ToyyibPay redirect attempt, never right after the booking is saved.
  const commitJubahBooking = (booking: JubahBooking) => setJubahBooking(booking);

  return (
    <AppContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        deepLinkPage,
        goBack,
        canGoBack: pageHistory.length > 0,
        setLeaveGuard,
        isPreviewMode,
        enterPreviewMode,
        exitPreviewMode,
        activeRole,
        switchToDriverMode,
        switchToAdminMode,
        switchToRiderMode,
        user,
        login,
        register,
        logout,
        updateProfile,
        refreshUserData,
        receiptGateActive,
        isSheetOpen,
        setSheetOpen,
        profileEditIntentRef,
        confirmModal,
        showConfirmModal,
        hideConfirmModal,
        showAuthGate,
        guestCampus,
        setGuestCampus,
        notifications,
        addNotification,
        markAllNotificationsRead,
        activeRide,
        jubahBooking,
        bookJubah,
        scheduleReturn,
        cancelJubahBooking,
        startNewJubahBooking,
        commitJubahBooking
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
