import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ConfirmModal } from './components/ConfirmModal';
// Critical path — loaded immediately
import { SplashScreen } from './pages/SplashScreen';
import { Login } from './pages/Login';
// Everything else — split into separate chunks, loaded on demand
const Register         = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const Dashboard        = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Transport        = lazy(() => import('./pages/Transport').then(m => ({ default: m.Transport })));
const Jubah            = lazy(() => import('./pages/Jubah').then(m => ({ default: m.Jubah })));
const Profile          = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const DriverHome       = lazy(() => import('./pages/DriverHome').then(m => ({ default: m.DriverHome })));
const RiderHome        = lazy(() => import('./pages/RiderHome').then(m => ({ default: m.RiderHome })));
const AdminHome        = lazy(() => import('./pages/AdminHome').then(m => ({ default: m.AdminHome })));
const MyOrders         = lazy(() => import('./pages/MyOrders').then(m => ({ default: m.MyOrders })));
const Activity         = lazy(() => import('./pages/Activity').then(m => ({ default: m.Activity })));
const GerakRental      = lazy(() => import('./pages/GerakRental').then(m => ({ default: m.GerakRental })));
const AcademicCalendar = lazy(() => import('./pages/AcademicCalendar').then(m => ({ default: m.AcademicCalendar })));
const ForgotPassword   = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPassword })));
const ResetPassword    = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const TrackJubah          = lazy(() => import('./pages/TrackJubah').then(m => ({ default: m.TrackJubah })));
const GerakTransporter    = lazy(() => import('./pages/GerakTransporter').then(m => ({ default: m.GerakTransporter })));
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

const InstallPrompt: React.FC = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow]         = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep]         = useState<'prompt' | 'ios'>('prompt');

  useEffect(() => {
    if (isStandalone() || dismissed) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      // Delay so it doesn't pop immediately on load
      setTimeout(() => setShow(true), 3500);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setShow(false));
    // iOS: show after delay
    if (isIos() && !isStandalone()) {
      setTimeout(() => { setStep('ios'); setShow(true); }, 3500);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  const dismiss = () => { setShow(false); setDismissed(true); };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') dismiss();
  };

  if (!show || isStandalone()) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      onClick={dismiss}
    >
      <div
        className="w-full bg-white rounded-t-3xl shadow-2xl animate-slide-up overflow-hidden"
        style={{ maxWidth: 480, paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* App card */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-md shrink-0 flex items-center justify-center">
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '2.4rem', color: '#0F172A', lineHeight: 1, fontWeight: 300 }}>g</span>
          </div>
          <div>
            <p className="text-sm text-slate-900 m-0" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300 }}>
              ger<span style={{ color: '#EF4444' }}>a</span>k
            </p>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Smart Campus Platform · UMPSA</p>
          </div>
        </div>

        {step === 'ios' ? (
          /* iOS instructions */
          <div className="px-6 pt-5 pb-2 flex flex-col gap-4">
            <p className="text-sm font-black text-slate-800 text-center">Add to your Home Screen</p>
            {[
              { n: '1', icon: '⬆', text: <>Tap the <b>Share</b> button at the bottom of Safari</> },
              { n: '2', icon: '➕', text: <>Tap <b>"Add to Home Screen"</b></> },
              { n: '3', icon: '✅', text: <>Tap <b>"Add"</b> — gerak opens like a real app</> },
            ].map(({ n, icon, text }) => (
              <div key={n} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">{n}</span>
                <span className="text-sm text-slate-700 font-medium">{icon} {text}</span>
              </div>
            ))}
            <button onClick={dismiss}
              className="mt-2 w-full bg-slate-900 text-white font-extrabold py-3.5 rounded-2xl text-sm active:scale-95 transition">
              Got it
            </button>
          </div>
        ) : (
          /* Android / Chrome install */
          <div className="px-6 pt-5 pb-2 flex flex-col gap-4">
            <div className="text-center">
              <p className="text-sm font-black text-slate-800 mb-1">Install gerak on your phone</p>
              <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                Works offline · loads instantly · no App Store needed
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={dismiss}
                className="flex-1 bg-slate-100 text-slate-600 font-extrabold text-sm py-3.5 rounded-2xl active:scale-95 transition">
                Not now
              </button>
              <button onClick={handleInstall}
                className="flex-1 bg-primary text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-lg shadow-primary/25 active:scale-95 transition">
                Install
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SwipeBackGesture: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { goBack, canGoBack, currentPage } = useApp();

  const [dragX,      setDragX]      = useState(0);
  const [gestureOn,  setGestureOn]  = useState(false); // finger is down → no CSS transition
  const [showBackUI, setShowBackUI] = useState(false); // show shadow + arrow (back mode only)

  const dragXRef      = useRef(0);
  const modeRef       = useRef<'none' | 'back' | 'bounce'>('none');
  const startXRef     = useRef(0);
  const startYRef     = useRef(0);
  const dirLockRef    = useRef<'h' | 'v' | null>(null);
  const canGoBackRef  = useRef(canGoBack);
  const goBackRef     = useRef(goBack);
  const currentPageRef = useRef(currentPage);

  useEffect(() => { canGoBackRef.current = canGoBack; }, [canGoBack]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { goBackRef.current = goBack; }, [goBack]);

  const EDGE       = 40;   // px from left edge to activate gesture
  const TRIGGER    = 90;   // px drag to commit back navigation
  const BOUNCE_MAX = 55;   // max px elastic bounce when at floor

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX >= EDGE) return;
      // Admin's own sub-navigation (e.g. Jubah's list -> card -> details) is
      // 100% explicit-button-driven and puts a back-chevron right at the
      // left edge — exactly where this gesture arms. A vertical scroll
      // gesture starting there can misclassify as horizontal in its first
      // few pixels, and preventDefault() below then silently eats the
      // scroll. Admin never relies on this swipe, so just skip it there.
      if (currentPageRef.current === 'admin-home') return;
      // Don't arm the back-gesture while a text field is focused — reaching
      // toward the keyboard or repositioning the cursor near the left edge
      // can otherwise register as a swipe and spuriously trigger a page's
      // leave-guard (e.g. Jubah's "Discard this booking?") while typing.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        modeRef.current = 'none';
        return;
      }
      startXRef.current  = t.clientX;
      startYRef.current  = t.clientY;
      dirLockRef.current = null;
      dragXRef.current   = 0;
      modeRef.current    = canGoBackRef.current ? 'back' : 'bounce';
    };

    const onMove = (e: TouchEvent) => {
      if (modeRef.current === 'none') return;
      const t  = e.touches[0];
      const dx = t.clientX - startXRef.current;
      const dy = Math.abs(t.clientY - startYRef.current);

      if (!dirLockRef.current) {
        if (Math.abs(dx) < 6 && dy < 6) return;
        dirLockRef.current = Math.abs(dx) >= dy ? 'h' : 'v';
      }
      if (dirLockRef.current === 'v') { modeRef.current = 'none'; return; }
      if (dx <= 0) return;

      e.preventDefault(); // block native browser gesture
      dragXRef.current = modeRef.current === 'back'
        ? Math.min(dx, window.innerWidth * 0.85)
        : Math.min(dx * 0.28, BOUNCE_MAX); // elastic resistance at floor

      setGestureOn(true);
      setDragX(dragXRef.current);
      setShowBackUI(modeRef.current === 'back');
    };

    const onEnd = () => {
      if (modeRef.current === 'none') return;
      const triggered = modeRef.current === 'back' && dragXRef.current >= TRIGGER;
      modeRef.current  = 'none';
      dragXRef.current = 0;
      setGestureOn(false);
      setDragX(0);
      setShowBackUI(false);
      if (triggered) goBackRef.current();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove',  onMove,  { passive: false });
    window.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend',   onEnd);
    };
  }, []);

  const progress = Math.min(dragX / TRIGGER, 1);

  return (
    <>
      {/* Shadow behind page — back drag only */}
      {showBackUI && dragX > 0 && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9990,
            background: 'linear-gradient(to right, rgba(0,0,0,0.08), rgba(0,0,0,0.18))',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Sliding page */}
      <div
        style={{
          transform: dragX > 0 ? `translateX(${dragX}px)` : 'translateX(0)',
          transition: gestureOn ? 'none' : 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          position: 'relative', zIndex: 9991,
          width: '100%', flex: 1,
          backgroundColor: '#ffffff',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {children}
      </div>

      {/* Back arrow circle — back drag only */}
      {showBackUI && dragX > 0 && (
        <div
          style={{
            position: 'fixed',
            left: Math.max(8, dragX - 30),
            top: '50%',
            transform: `translateY(-50%) scale(${0.55 + progress * 0.45})`,
            width: 44, height: 44,
            borderRadius: '50%',
            background: progress >= 1 ? '#0f172a' : 'rgba(255,255,255,0.96)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999, pointerEvents: 'none',
            transition: 'background 0.15s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={progress >= 1 ? 'white' : '#1e293b'}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </div>
      )}
    </>
  );
};

const AppContent: React.FC = () => {
  const { currentPage, user, activeRole } = useApp();
  const isAdminRoute = currentPage === 'admin-home';

  const renderPage = () => {
    switch (currentPage) {
      case 'splash':
        return <SplashScreen />;
      case 'login':
        return <Login />;
      case 'register':
        return <Register />;
      case 'dashboard':
        return <Dashboard />;
      case 'transport':
        return <Transport />;
      case 'jubah':
        return <Jubah />;
      case 'profile':
        return <Profile />;
      case 'notifications':
        return <NotificationsPage />;
      case 'driver-home':
        return (user.role === 'driver' || user.canDrive || activeRole === 'driver') ? <DriverHome /> : <Dashboard />;
      case 'rider-home':
        return <RiderHome />;
      case 'admin-home':
        return (user.role === 'admin' || user.role === 'superadmin') ? <AdminHome /> : <Dashboard />;
      case 'my-orders':
        return <MyOrders />;
      case 'activity':
        return <Activity />;
      case 'gerak-rental':
        return <GerakRental />;
      case 'academic-calendar':
        return <AcademicCalendar />;
      case 'forgot-password':
        return <ForgotPassword />;
      case 'reset-password':
        return <ResetPassword />;
      case 'track-jubah':
        return <TrackJubah />;
      case 'gerak-transporter':
        return <GerakTransporter />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className={`mobile-container flex flex-col h-full bg-white select-none overscroll-x-none ${isAdminRoute ? 'admin-desktop' : ''}`}>
      <ConfirmModal />
      <div className={isAdminRoute ? 'lg:hidden' : ''}><Header /></div>
      <div key={currentPage} className="flex-1 flex flex-col overflow-hidden page-transition bg-white">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-white"><span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}>
          {renderPage()}
        </Suspense>
      </div>
      <div className={isAdminRoute ? 'lg:hidden' : ''}><BottomNav /></div>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <InstallPrompt />
      <SwipeBackGesture>
        <AppContent />
      </SwipeBackGesture>
    </AppProvider>
  );
}

export default App;
