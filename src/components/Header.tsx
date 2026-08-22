import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, ChevronLeft, ShieldCheck, Car, Bike, MoreHorizontal, MoreVertical, Eye, ChevronDown, X, MapPin, User, Pencil, CalendarCheck2, FileCheck2, Menu, Check } from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';
import { UNIVERSITIES as UNIVERSITY_OPTIONS } from '../lib/universities';
import { CampusStatusToggle } from './CampusStatusToggle';

const UNI_CAMPUSES: Record<string, string[]> = Object.fromEntries(
  UNIVERSITY_OPTIONS.flatMap(university => [
    [university.shortLabel, university.campuses],
    [university.fullName, university.campuses],
    [university.label, university.campuses],
  ]),
);
const UNIVERSITIES = UNIVERSITY_OPTIONS.map(university => university.shortLabel);

const toTitleCase = (str: string) =>
  str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const Avatar: React.FC<{ url?: string; name?: string; size: number; guest?: boolean }> = ({ url, name, size, guest }) => {
  const dim = { width: `${size}px`, height: `${size}px` };
  if (guest) {
    return (
      <div className="rounded-full bg-slate-100 flex items-center justify-center shrink-0" style={dim}>
        <User className="text-slate-400" style={{ width: size * 0.55, height: size * 0.55 }} />
      </div>
    );
  }
  if (url) {
    return <img src={url} alt="" className="rounded-full object-cover shrink-0" style={dim} />;
  }
  return (
    <div className="rounded-full bg-slate-900 flex items-center justify-center shrink-0" style={dim}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 900, color: '#FFFFFF', fontSize: size * 0.45 }}>
        {(name?.[0] || 'U').toUpperCase()}
      </span>
    </div>
  );
};

export const Header: React.FC = () => {
  const {
    currentPage, setCurrentPage, goBack, canGoBack, notifications, user,
    activeRole, isPreviewMode,
    switchToAdminMode, switchToDriverMode, switchToRiderMode, enterPreviewMode,
    showAuthGate, guestCampus, setGuestCampus, updateProfile, profileEditIntentRef,
    adminUniversityKey, setAdminUniversityKey,
  } = useApp();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showCampusSheet, setShowCampusSheet] = useState(false);
  const [sheetStep, setSheetStep] = useState<'university' | 'campus'>('university');
  const [tempUni, setTempUni] = useState('');
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [showMyCampusSheet, setShowMyCampusSheet] = useState(false);
  const [showAdminUniversityMenu, setShowAdminUniversityMenu] = useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const isProviderRole = activeRole === 'driver' || activeRole === 'rider' || user.role === 'driver' || user.role === 'rider';
  const paymentValid = Boolean(user.receiptGateExempt || (user.feeReceiptExpiry && new Date(user.feeReceiptExpiry).getTime() >= Date.now()));
  const documentLabel = user.docsStatus === 'none' ? 'Not Uploaded' : toTitleCase(user.docsStatus || 'none');
  const providerUniversity = UNIVERSITY_OPTIONS.find(option =>
    option.shortLabel === user.university || option.fullName === user.university || option.label === user.university,
  )?.shortLabel || user.university || 'UMPSA';

  if (currentPage === 'splash' || currentPage === 'login' || currentPage === 'register' || currentPage === 'forgot-password' || currentPage === 'reset-password' || currentPage === 'profile' || currentPage === 'complete-profile') {
    return null;
  }

  // Guest (not logged in) — Sign in button only
  if (!user.isLoggedIn) {
    return (
      <header
        className="sticky top-0 z-40 bg-white px-4 py-3 flex items-center justify-between"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-1">
          {canGoBack && (
            <button
              onClick={goBack}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition text-slate-600 mr-0.5"
              aria-label="Go back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button
            onPointerDown={(e) => { e.preventDefault(); showAuthGate(); }}
            className="flex items-center gap-2 active:opacity-70 transition-transform active:scale-95"
          >
            <Avatar guest size={32} />
            <span className="text-sm font-semibold text-slate-800">Sign in</span>
          </button>
        </div>
        <button
          onClick={() => showAuthGate()}
          className="relative p-2.5 text-slate-600 rounded-full hover:bg-slate-50 active:scale-90 transition"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>
      </header>
    );
  }

  // Admin customer-preview mode — campus selector so admin can test different campuses
  if (isPreviewMode) {
    const openSheet = () => { setSheetStep('university'); setTempUni(''); setShowCampusSheet(true); };
    const closeSheet = () => { setShowCampusSheet(false); setSheetStep('university'); setTempUni(''); };
    const selectUni = (uni: string) => { setTempUni(uni); setSheetStep('campus'); };
    const selectCampus = (campus: string) => { setGuestCampus(`${tempUni} ${campus}`); closeSheet(); };

    return (
      <>
        <header
          className="sticky top-0 z-40 bg-white px-4 py-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-1">
            {canGoBack && (
              <button
                onClick={goBack}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition text-slate-600 mr-0.5"
                aria-label="Go back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={openSheet}
              className="flex items-center gap-1.5 active:opacity-70 transition active:scale-95"
            >
              <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800 max-w-[200px] truncate">
                {guestCampus || 'Select Campus'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Admin escape hatch — red 3-dots to exit preview */}
            {isPreviewMode && (
              <div className="relative">
                <button
                  onClick={() => setShowRoleMenu(p => !p)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-500 text-white shadow-md shadow-red-500/40 active:scale-90 transition"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showRoleMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(false); }} />
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[180px]">
                      <button
                        onClick={() => { switchToAdminMode(); setShowRoleMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold text-slate-600 hover:bg-slate-50 transition active:scale-95"
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" /> Exit Preview → Admin
                      </button>
                      <button
                        onClick={() => { switchToDriverMode(); setShowRoleMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold text-slate-600 hover:bg-slate-50 transition active:scale-95"
                      >
                        <Car className="w-4 h-4 shrink-0" /> Switch to Driver
                      </button>
                      <button
                        onPointerDown={(e) => { e.preventDefault(); switchToRiderMode(); setShowRoleMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold text-slate-600 hover:bg-slate-50 transition active:scale-95"
                      >
                        <Bike className="w-4 h-4 shrink-0" /> Switch to Rider
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Bell */}
            <button
              onClick={() => showAuthGate()}
              className="relative p-2.5 text-slate-600 rounded-full hover:bg-slate-50 active:scale-90 transition"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Campus selection sheet */}
        {showCampusSheet && (
          <div
            className="fixed inset-0 z-[9998] bg-black/30 flex items-end"
            style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
            onPointerDown={(e) => { e.preventDefault(); closeSheet(); }}
          >
            <div
              className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[70dvh] flex flex-col animate-slide-up"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
              onPointerDown={e => e.stopPropagation()}
            >
              {/* Drag pill */}
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-1 shrink-0" />

              {/* Sheet header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
                {sheetStep === 'campus' ? (
                  <button
                    onClick={() => setSheetStep('university')}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="w-8" />
                )}
                <span className="text-sm font-bold text-slate-800">
                  {sheetStep === 'university' ? 'Select University' : `${tempUni} — Select Campus`}
                </span>
                <button
                  onClick={closeSheet}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-3 flex flex-col gap-2">
                {sheetStep === 'university'
                  ? UNIVERSITIES.map(uni => (
                    <button
                      key={uni}
                      onClick={() => selectUni(uni)}
                      className="w-full flex items-center justify-between px-4 py-4 bg-white border border-slate-100 rounded-2xl active:bg-slate-50 active:scale-[0.99] transition"
                    >
                      <span className="text-sm font-semibold text-slate-800">{uni}</span>
                      <ChevronDown className="w-4 h-4 text-slate-300 -rotate-90" />
                    </button>
                  ))
                  : UNI_CAMPUSES[tempUni].map(campus => {
                    const val = `${tempUni} ${campus}`;
                    const selected = guestCampus === val;
                    return (
                      <button
                        key={campus}
                        onClick={() => selectCampus(campus)}
                        className={`w-full flex items-center justify-between px-4 py-4 border rounded-2xl bg-white active:bg-slate-50 active:scale-[0.99] transition-transform ${
                          selected ? 'border-slate-900' : 'border-slate-100'
                        }`}
                      >
                        <span className={`text-sm font-semibold ${selected ? 'text-slate-900' : 'text-slate-800'}`}>
                          {tempUni} {campus}
                        </span>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
                        }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })
                }
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const isNotAdmin = isPreviewMode || activeRole === 'driver' || activeRole === 'rider';

  return (
    <>
      <header
        className="sticky top-0 z-40 bg-white px-4 py-3 flex items-center justify-between"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        {/* Left: Back button + Profile circle */}
        <div className="flex items-center gap-1">
          {canGoBack && (
            <button
              onClick={goBack}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition text-slate-600 mr-0.5"
              aria-label="Go back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button
            onPointerDown={(e) => { e.preventDefault(); setShowProfilePreview(true); }}
            className="flex items-center gap-2 active:opacity-70 transition-transform active:scale-95"
          >
            <Avatar url={user.avatarUrl} name={user.name} size={32} />
            <span className="text-sm font-semibold text-slate-800 max-w-[140px] truncate">
              Hi, {toTitleCase(user.name).split(' ')[0]}
            </span>
          </button>
        </div>

        {/* Right: campus selector (customer only) + role switcher + bell */}
        <div className="flex items-center gap-2">

          {/* Customer campus selector */}
          {user.role === 'customer' && (
            <button
              onPointerDown={(e) => { e.preventDefault(); setShowMyCampusSheet(true); }}
              className="flex items-center gap-1 active:opacity-70 transition-transform active:scale-95"
            >
              <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800 max-w-[90px] truncate">
                {user.campus || 'Campus'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          )}

          {/* Superadmin — 3-dot dropdown, red when not in admin role */}
          {user.role === 'superadmin' && (
            <div className="relative order-1">
              <button
                onClick={() => setShowRoleMenu(p => !p)}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition active:scale-90 ${
                  isNotAdmin
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/40'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showRoleMenu && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(false); }} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-y-auto min-w-[210px] max-h-[calc(100dvh-6rem)]">
                    <button
                      onPointerDown={(e) => { e.preventDefault(); switchToAdminMode(); setShowRoleMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold transition-transform active:scale-95 ${
                        !isNotAdmin ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      Admin
                      {!isNotAdmin && <span className="ml-auto text-[8px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">Active</span>}
                    </button>

                    <button
                      onPointerDown={(e) => { e.preventDefault(); switchToDriverMode(); setShowRoleMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold transition-transform active:scale-95 ${
                        activeRole === 'driver' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Car className="w-4 h-4 shrink-0" />
                      Driver
                      {activeRole === 'driver' && <span className="ml-auto text-[8px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">Active</span>}
                    </button>

                    <button
                      onPointerDown={(e) => { e.preventDefault(); switchToRiderMode(); setShowRoleMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold transition active:scale-95 ${
                        activeRole === 'rider' ? 'bg-amber-50 text-amber-600' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Bike className="w-4 h-4 shrink-0" />
                      Rider
                      {activeRole === 'rider' && <span className="ml-auto text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">Active</span>}
                    </button>

                    <div className="border-t border-slate-100" />

                    <button
                      onClick={() => { enterPreviewMode(); setShowRoleMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold text-violet-600 hover:bg-violet-50 transition active:scale-95"
                    >
                      <Eye className="w-4 h-4 shrink-0" />
                      Customer Preview
                    </button>
                    <div className="border-t border-slate-100" />
                    <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-600">
                      <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
                      <span className="font-semibold">Campus Presence</span>
                      <span className="ml-auto"><CampusStatusToggle variant="icon" /></span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {(user.role === 'admin' || user.role === 'superadmin') && (
            <div className="relative order-3">
              <button onPointerDown={(e) => { e.preventDefault(); setShowAdminUniversityMenu(p => !p); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-600 active:bg-slate-50 active:scale-90 transition-transform"
                aria-label="Select admin university">
                <Menu className="w-5 h-5" />
              </button>
              {showAdminUniversityMenu && (<>
                <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowAdminUniversityMenu(false); }} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-y-auto overscroll-contain min-w-[220px] max-h-[13.5rem] p-2">
                  {UNIVERSITY_OPTIONS.map(option => {
                    const selected = adminUniversityKey === option.key;
                    return <button key={option.key} onPointerDown={(e) => { e.preventDefault(); setAdminUniversityKey(option.key); setShowAdminUniversityMenu(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-transform active:scale-[0.99] ${selected ? 'border border-slate-900 bg-slate-50' : 'border border-transparent'}`}>
                      <span className="flex-1 text-xs font-semibold text-slate-700">{option.shortLabel}</span>
                      {selected && <Check className="w-4 h-4 text-slate-800" />}
                    </button>;
                  })}
                </div>
              </>)}
            </div>
          )}

          {(user.role === 'admin' || user.role === 'superadmin') && (
            <button onPointerDown={(e) => { e.preventDefault(); setCurrentPage('notifications'); }}
              className="relative order-2 p-2 text-slate-600 active:scale-90 transition-transform" aria-label="Inbox">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white">{unreadCount}</span>}
            </button>
          )}

          {user.role !== 'superadmin' && isProviderRole && (
            <div className="relative order-1">
              <button onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(p => !p); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 active:bg-slate-50 active:scale-90 transition-transform"
                aria-label="Account and campus status">
                <MoreVertical className="w-4 h-4" />
              </button>
              {showRoleMenu && (<>
                <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(false); }} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[220px]">
                  <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-600"><MapPin className="w-4 h-4 shrink-0 text-slate-400" /><span className="font-semibold">{providerUniversity} {user.campus || 'Campus'}</span></div>
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-600"><ShieldCheck className="w-4 h-4 shrink-0 text-slate-400" /><span className="font-semibold">Status</span><span className="ml-auto text-emerald-600 font-semibold">{toTitleCase(user.status || 'active')}</span></div>
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-600"><CalendarCheck2 className="w-4 h-4 shrink-0 text-slate-400" /><span className="font-semibold">Payment</span><span className={`ml-auto font-semibold ${paymentValid ? 'text-emerald-600' : 'text-red-500'}`}>{paymentValid ? 'Valid' : 'Expired'}</span></div>
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-600"><FileCheck2 className="w-4 h-4 shrink-0 text-slate-400" /><span className="font-semibold">Document</span><span className={`ml-auto font-semibold ${user.docsStatus === 'approved' ? 'text-emerald-600' : 'text-slate-500'}`}>{documentLabel}</span></div>
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-600"><MapPin className="w-4 h-4 shrink-0 text-slate-400" /><span className="font-semibold">Campus Presence</span><span className="ml-auto"><CampusStatusToggle variant="icon" /></span></div>
                </div>
              </>)}
            </div>
          )}

          {user.role === 'admin' && activeRole !== 'driver' && (
            <div className="relative order-1">
              <button onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(p => !p); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 active:bg-slate-50 active:scale-90 transition-transform"
                aria-label="Campus status">
                <MoreVertical className="w-4 h-4" />
              </button>
              {showRoleMenu && (<>
                <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(false); }} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[210px]">
                  <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-600"><MapPin className="w-4 h-4 shrink-0 text-slate-400" /><span className="font-semibold">Campus Presence</span><span className="ml-auto"><CampusStatusToggle variant="icon" /></span></div>
                </div>
              </>)}
            </div>
          )}

          {/* Regular admin + canDrive — 2-segment pill toggle.
              Two stacked layers instead of toggling colour classes
              directly — this WebView unreliably repaints colour changes;
              opacity changes repaint reliably, so only opacity is
              toggled here. */}
          {user.role === 'admin' && user.canDrive && (
            <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
              <button
                onPointerDown={(e) => { e.preventDefault(); switchToAdminMode(); }}
                className="relative rounded-[10px] transition-transform active:scale-95"
              >
                <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-extrabold text-slate-400">
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </span>
                <span
                  className={`absolute inset-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-[10px] bg-white text-slate-800 shadow-sm text-xs font-extrabold transition-opacity duration-150 ${
                    activeRole !== 'driver' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </span>
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); switchToDriverMode(); }}
                className="relative rounded-[10px] transition-transform active:scale-95"
              >
                <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-extrabold text-slate-400">
                  <Car className="w-3 h-3" />
                  Driver
                </span>
                <span
                  className={`absolute inset-0 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-[10px] bg-primary text-white shadow-sm text-xs font-extrabold transition-opacity duration-150 ${
                    activeRole === 'driver' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <Car className="w-3 h-3" />
                  Driver
                </span>
              </button>
            </div>
          )}

          {/* Notification Bell */}
          {user.role !== 'admin' && user.role !== 'superadmin' && <button
            onClick={() => setCurrentPage('notifications')}
            className="relative p-2.5 text-slate-600 hover:text-primary rounded-full hover:bg-slate-50 transition active:scale-90"
            aria-label="Inbox"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4.5 h-4.5 bg-danger text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>}
        </div>
      </header>

      {/* My campus sheet — customer campus switcher */}
      {showMyCampusSheet && (
        <div
          className="fixed inset-0 z-[9998] bg-black/30 flex items-end"
          style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onPointerDown={(e) => { e.preventDefault(); setShowMyCampusSheet(false); }}
        >
          <div
            className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[70dvh] flex flex-col animate-slide-up"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
            onPointerDown={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-1 shrink-0" />
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <div className="w-8" />
              <span className="text-sm font-bold text-slate-800">Select Campus</span>
              <button
                onPointerDown={(e) => { e.preventDefault(); setShowMyCampusSheet(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-3 pb-2 flex flex-col gap-2">
              {(UNI_CAMPUSES[user.university] ?? UNI_CAMPUSES.UMPSA).map(campus => {
                const selected = user.campus === campus;
                return (
                  <button
                    key={campus}
                    onClick={() => { updateProfile({ campus }); setShowMyCampusSheet(false); }}
                    className={`w-full flex items-center justify-between px-4 py-4 border rounded-2xl bg-white active:bg-slate-50 active:scale-[0.99] transition-transform ${
                      selected ? 'border-slate-900' : 'border-slate-100'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${selected ? 'text-slate-900' : 'text-slate-800'}`}>
                      {user.university} {campus}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selected ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
                    }`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Profile preview — bare circle, no card; edit shortcut for everyone, plus contact info for staff roles */}
      {showProfilePreview && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          onPointerDown={(e) => { e.preventDefault(); setShowProfilePreview(false); }}
        >
          <div className="relative flex flex-col items-center gap-3" onPointerDown={e => e.stopPropagation()}>
            <button
              onPointerDown={(e) => { e.preventDefault(); setShowProfilePreview(false); }}
              className="absolute -top-2 -right-2 z-10 w-8 h-8 flex items-center justify-center rounded-xl bg-white text-slate-500 shadow-md active:scale-90 transition-transform"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative w-44 h-44 shrink-0">
              <Avatar url={user.avatarUrl} name={user.name} size={176} />
              <button
                onPointerDown={(e) => { e.preventDefault(); setShowProfilePreview(false); profileEditIntentRef.current = true; setCurrentPage('profile'); }}
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center active:scale-90 transition-transform shadow-md shadow-primary/30"
                aria-label="Edit profile"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-lg font-semibold text-slate-800 text-center m-0">
              {toTitleCase(user.name).split(' ')[0]}
            </h2>

            {user.role !== 'customer' && user.phone && (
              <div className="flex items-center gap-2 -mt-1.5">
                <span className="text-sm font-normal text-slate-500">{user.phone}</span>
                <WaBtn phone={user.phone} iconClass="w-5 h-5" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
