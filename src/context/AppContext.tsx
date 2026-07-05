import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { INACTIVITY_LIMIT_MS, isSessionExpired, touchActivity, setSessionExpiredMessage } from '../lib/idleSession';

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
  | 'gerak-rental'
  | 'academic-calendar'
  | 'forgot-password'
  | 'reset-password'
  | 'track-jubah'
  | 'gerak-transporter';

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
  icNumber: string;
  icUrl: string;
  licenseUrl: string;
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
  university: string;
  faculty: string;
  matricId: string;
  paymentMode: 'pickup' | 'postage' | 'deposit';
  remark: 'Master' | 'PHD' | 'Degree' | 'Diploma';
  combinedFileName: string;
  cost: number;
  balanceDue: number;
  status: 'ordered' | 'cleaning' | 'packaging' | 'delivering' | 'delivered';
  returnScheduled: boolean;
  returnMethod?: 'self' | 'locker' | 'courier';
  returnDate?: string;
  returnTime?: string;
}

interface AppContextType {
  // Navigation & Session
  currentPage: ActivePage;
  setCurrentPage: (page: ActivePage) => void;
  goBack: () => void;
  canGoBack: boolean;
  isPreviewMode: boolean;
  enterPreviewMode: () => void;
  exitPreviewMode: () => void;
  activeRole: 'admin' | 'driver' | 'rider' | null;
  switchToDriverMode: () => void;
  switchToAdminMode: () => void;
  switchToRiderMode: () => void;
  user: UserSession;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  register: (name: string, matricNo: string, email: string, password: string, phone: string, university: string, campus: string) => Promise<{ error: string | null }>;
  logout: () => void;
  updateProfile: (updates: { name?: string; matricNo?: string; email?: string; phone?: string; vehicle?: string; plateNumber?: string; icNumber?: string; feeReceiptUrl?: string }) => Promise<{ error: string | null }>;
  refreshUserData: () => Promise<void>;
  receiptGateActive: boolean;
  isSheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;

  // Notifications
  notifications: NotificationItem[];
  addNotification: (title: string, description: string, type: NotificationItem['type']) => void;
  markAllNotificationsRead: () => void;

  // Transport Module
  activeRide: RideBooking | null;
  rideHistory: RideBooking[];
  bookRide: (pickup: string, destination: string, fare: number) => void;
  cancelRide: () => void;
  simulateRideProgress: () => void;

  // Jubah Delivery Module
  jubahBooking: JubahBooking | null;
  bookJubah: (reference: string, fullName: string, icNumber: string, hpNumber: string, university: string, faculty: string, matricId: string, paymentMode: 'pickup' | 'postage' | 'deposit', remark: 'Master' | 'PHD' | 'Degree' | 'Diploma', combinedFileName: string, cost: number, balanceDue: number, riderId?: string, riderName?: string, campus?: 'Pekan' | 'Gambang', deliveryAddress?: string, driveDocsUrl?: string, drivePaymentUrl?: string, driveOscarUrl?: string, driveSkpgUrl?: string, driveKonvoUrl?: string, driveIcUrl?: string) => void;
  scheduleReturn: (method: 'self' | 'locker' | 'courier', date: string, time: string) => void;
  cancelJubahBooking: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Navigation & Session
  const [currentPage, _setCurrentPage] = useState<ActivePage>('splash');
  const [pageHistory, setPageHistory] = useState<ActivePage[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [activeRole, setActiveRole] = useState<'admin' | 'driver' | 'rider' | null>(null);

  const HISTORY_EXCLUDED: ActivePage[] = ['splash'];
  const HOME_PAGES: ActivePage[] = ['dashboard', 'driver-home', 'rider-home', 'admin-home', 'login', 'profile', 'academic-calendar'];

  const setCurrentPage = (page: ActivePage) => {
    if (HOME_PAGES.includes(page)) {
      setPageHistory([]);
    } else if (!HISTORY_EXCLUDED.includes(currentPage)) {
      setPageHistory(prev => [...prev, currentPage]);
    }
    _setCurrentPage(page);
  };

  const goBack = () => {
    setPageHistory(prev => {
      if (prev.length === 0) return prev;
      _setCurrentPage(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  };

  // Android back button — intercept system popstate so the PWA doesn't close
  const pageHistoryRef = useRef(pageHistory);
  useEffect(() => { pageHistoryRef.current = pageHistory; }, [pageHistory]);
  useEffect(() => {
    window.history.pushState(null, '');
    const handlePopState = () => {
      if (pageHistoryRef.current.length > 0) {
        goBack();
      }
      // Always re-push so the browser never runs out of history entries
      window.history.pushState(null, '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global receipt gate — fetched once on mount, controlled by superadmin
  const [receiptGateActive, setReceiptGateActive] = useState(true);

  // Shared "is any bottom sheet/modal open" flag — BottomNav hides itself
  // while true, sidestepping any device-specific stacking-context quirks
  // where a fixed-position sheet might not reliably paint above it.
  const [isSheetOpen, setSheetOpen] = useState(false);
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
    icNumber: '',
    icUrl: '',
    licenseUrl: '',
    docsStatus: 'none',
    docsRejectReason: '',
    receiptGateExempt: false,
    isLoggedIn: false,
  });

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: '1',
      title: 'Welcome to gerak!',
      description: 'Your Smart Campus Service Platform is ready. Check out Transport or Jubah services.',
      time: 'Just now',
      isRead: false,
      type: 'system',
    },
    {
      id: '2',
      title: 'Graduation Notice 2026',
      description: 'Convocation robe booking is now open. Book early via Jubah Delivery to secure your sizes.',
      time: '2 hours ago',
      isRead: true,
      type: 'jubah',
    }
  ]);

  // Transport Module
  const [activeRide, setActiveRide] = useState<RideBooking | null>(null);
  const [rideHistory, setRideHistory] = useState<RideBooking[]>([
    {
      id: 'TX-8902',
      pickup: 'Kolej Kediaman Pertama (KK1)',
      destination: 'Dewan Peperiksaan Utama',
      fare: 4.50,
      date: 'Yesterday, 2:40 PM',
      status: 'completed',
    },
    {
      id: 'TX-7231',
      pickup: 'Fakulti Sains Komputer & Teknologi Maklumat',
      destination: 'Pusat Sukan',
      fare: 3.50,
      date: '24 May 2026',
      status: 'completed',
    }
  ]);

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

  // Simulation Interval References
  const [rideTimer, setRideTimer] = useState<number | null>(null);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      if (rideTimer) clearInterval(rideTimer);
    };
  }, [rideTimer]);

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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user || isRecovery) return;
      if (isSessionExpired(INACTIVITY_LIMIT_MS)) {
        supabase.auth.signOut();
        setSessionExpiredMessage();
        return;
      }
      loadProfile(session.user.id);
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

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id,name,matric_no,email,phone,university,campus,gerak_id,role,status,vehicle,plate_number,fee_receipt_url,fee_receipt_verified,fee_receipt_amount,fee_receipt_date,fee_receipt_expiry,fee_receipt_reject_reason,can_drive,can_rent,ic_number,ic_url,license_url,docs_status,docs_reject_reason,receipt_gate_exempt').eq('id', userId).single();
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
        icNumber:               data.ic_number ?? '',
        icUrl:                  data.ic_url           ?? '',
        licenseUrl:             data.license_url      ?? '',
        docsStatus:             data.docs_status      ?? 'none',
        docsRejectReason:       data.docs_reject_reason ?? '',
        receiptGateExempt:      data.receipt_gate_exempt ?? false,
        isLoggedIn:             true,
      });
      setPageHistory([]);
      if (role === 'driver') {
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
    if (authUser) await loadProfile(authUser.id);
    return { error: null };
  };

  const register = async (name: string, matricNo: string, email: string, password: string, phone: string, university: string, campus: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, matric_no: matricNo.toUpperCase(), phone, university, campus } },
    });
    if (error) return { error: error.message };
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) return { error: 'Account created! Please sign in.' };
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await supabase.from('profiles').update({ phone, university, campus }).eq('id', authUser.id);
      await loadProfile(authUser.id);
    }
    return { error: null };
  };

  const refreshUserData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data } = await supabase.from('profiles').select('id,name,matric_no,email,phone,university,campus,gerak_id,role,status,vehicle,plate_number,fee_receipt_url,fee_receipt_verified,fee_receipt_amount,fee_receipt_date,fee_receipt_expiry,fee_receipt_reject_reason,can_drive,can_rent,ic_number,ic_url,license_url,docs_status,docs_reject_reason,receipt_gate_exempt').eq('id', authUser.id).single();
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
        status:           data.status            ?? 'active',
      }));
    }
  };

  const updateProfile = async (updates: { name?: string; matricNo?: string; email?: string; phone?: string; vehicle?: string; plateNumber?: string; icNumber?: string; feeReceiptUrl?: string }): Promise<{ error: string | null }> => {
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

    if (updates.feeReceiptUrl  !== undefined) row.fee_receipt_url = updates.feeReceiptUrl;
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
    setUser({ name: '', matricNo: '', email: '', phone: '', university: '', campus: '', gerakId: '', role: 'customer', status: 'active', vehicle: '', plateNumber: '', feeReceiptUrl: '', feeReceiptVerified: false, feeReceiptAmount: '', feeReceiptDate: '', feeReceiptExpiry: '', feeReceiptRejectReason: '', canDrive: false, canRent: false, icNumber: '', icUrl: '', licenseUrl: '', docsStatus: 'none', docsRejectReason: '', receiptGateExempt: false, isLoggedIn: false });
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

  // 3. Transport Simulation
  const bookRide = (pickup: string, destination: string, fare: number) => {
    const mockDriver: DriverDetails = {
      name: 'Khairul Anwar',
      rating: 4.9,
      vehicle: 'Proton Saga (Forest Green)',
      plateNumber: 'VBY 8439',
      phone: '+6012-3456789',
      lat: 0.1,
      lng: 0.1
    };

    const newBooking: RideBooking = {
      id: `TX-${Math.floor(1000 + Math.random() * 9000)}`,
      pickup,
      destination,
      fare,
      date: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'searching',
      driver: mockDriver
    };

    setActiveRide(newBooking);
      if (currentPage !== 'transport') {
        setCurrentPage('transport');
      }

    // Start simulation steps
    let currentStep: TransportStep = 'searching';
    const intervalId = window.setInterval(() => {
      if (currentStep === 'searching') {
        currentStep = 'assigned';
        setActiveRide(prev => prev ? { ...prev, status: 'assigned' } : null);
        addNotification('Driver Found', 'Your driver Khairul Anwar (VBY 8439) has been assigned.', 'transport');
      } else if (currentStep === 'assigned') {
        currentStep = 'arriving';
        setActiveRide(prev => prev ? { ...prev, status: 'arriving' } : null);
      } else if (currentStep === 'arriving') {
        currentStep = 'active';
        setActiveRide(prev => prev ? { ...prev, status: 'active' } : null);
        addNotification('Trip Started', 'You have entered the vehicle. Driving to destination.', 'transport');
      } else if (currentStep === 'active') {
        currentStep = 'completed';
        setActiveRide(prev => {
          if (prev) {
            const completedRide = { ...prev, status: 'completed' as TransportStep };
            setRideHistory(history => [completedRide, ...history]);
            return null;
          }
          return null;
        });
        addNotification('Trip Completed', `You have arrived at ${destination}. Thank you for riding gerak.`, 'transport');
        clearInterval(intervalId);
        setRideTimer(null);
      }
    }, 6000); // changes stages every 6 seconds for test drive speed

    setRideTimer(intervalId);
  };

  const cancelRide = () => {
    if (activeRide) {
      if (rideTimer) {
        clearInterval(rideTimer);
        setRideTimer(null);
      }
      addNotification('Ride Cancelled', 'Your booking was cancelled.', 'transport');
      setActiveRide(null);
    }
  };

  const simulateRideProgress = () => {
    // manual advance shortcut for user testing
    if (!activeRide) return;
    if (rideTimer) {
      clearInterval(rideTimer);
      setRideTimer(null);
    }
    const stages: TransportStep[] = ['searching', 'assigned', 'arriving', 'active', 'completed'];
    const currentIndex = stages.indexOf(activeRide.status);
    if (currentIndex < stages.length - 1) {
      const nextStatus = stages[currentIndex + 1];
      if (nextStatus === 'completed') {
        const completedRide = { ...activeRide, status: 'completed' as TransportStep };
        setRideHistory(history => [completedRide, ...history]);
        setActiveRide(null);
        addNotification('Trip Completed', `Arrived at ${activeRide.destination}.`, 'transport');
      } else {
        setActiveRide(prev => prev ? { ...prev, status: nextStatus } : null);
        addNotification('Trip Stage Updated', `Ride is now: ${nextStatus.toUpperCase()}`, 'transport');
      }
    }
  };

  // 4. Jubah Delivery Operations
  const bookJubah = (
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
    cost: number,
    balanceDue: number,
    riderId?: string,
    riderName?: string,
    campus?: 'Pekan' | 'Gambang',
    deliveryAddress?: string,
    driveDocsUrl?: string,
    drivePaymentUrl?: string,
    driveOscarUrl?: string,
    driveSkpgUrl?: string,
    driveKonvoUrl?: string,
    driveIcUrl?: string,
  ) => {

    const newBooking: JubahBooking = {
      reference,
      fullName,
      icNumber,
      hpNumber,
      university,
      faculty,
      matricId,
      paymentMode,
      remark,
      combinedFileName,
      cost,
      balanceDue,
      status: 'ordered',
      returnScheduled: false,
    };

    setJubahBooking(newBooking);
    addNotification('Robe Booking Confirmed', `Booking for ${fullName} (${remark}) confirmed. Service fee: RM${cost.toFixed(2)}.`, 'jubah');

    // Persist to Supabase via SECURITY DEFINER RPC (bypasses RLS for guest bookings)
    if (campus) {
      supabase.auth.getUser().then(({ data: { user: authUser } }) => {
        supabase.rpc('create_jubah_booking', {
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
          p_cost:              cost,
          p_balance_due:       balanceDue,
          p_rider_id:          riderId         ?? null,
          p_rider_name:        riderName       ?? null,
          p_delivery_address:  deliveryAddress ?? null,
          p_drive_docs_url:    driveDocsUrl    ?? null,
          p_drive_payment_url: drivePaymentUrl ?? null,
          p_drive_oscar_url:   driveOscarUrl   ?? null,
          p_drive_skpg_url:    driveSkpgUrl    ?? null,
          p_drive_konvo_url:   driveKonvoUrl   ?? null,
          p_drive_ic_url:      driveIcUrl      ?? null,
          p_customer_id:       authUser?.id    ?? null,
        }).then(({ data, error }) => {
          if (error || !data?.success) console.error('[GERAK] Booking save failed:', error ?? data?.error);
        });
      });
    }
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

  return (
    <AppContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        goBack,
        canGoBack: pageHistory.length > 0,
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
        notifications,
        addNotification,
        markAllNotificationsRead,
        activeRide,
        rideHistory,
        bookRide,
        cancelRide,
        simulateRideProgress,
        jubahBooking,
        bookJubah,
        scheduleReturn,
        cancelJubahBooking
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
