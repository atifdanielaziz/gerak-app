import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, ChevronLeft, ShieldCheck, Car, Bike, MoreHorizontal, Eye, ChevronDown, X, MapPin, User, Pencil } from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';

const UNI_CAMPUSES: Record<string, string[]> = {
  'UMPSA': ['Pekan', 'Gambang'],
};
const UNIVERSITIES = Object.keys(UNI_CAMPUSES);

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
  } = useApp();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showCampusSheet, setShowCampusSheet] = useState(false);
  const [sheetStep, setSheetStep] = useState<'university' | 'campus'>('university');
  const [tempUni, setTempUni] = useState('');
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [showMyCampusSheet, setShowMyCampusSheet] = useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (currentPage === 'splash' || currentPage === 'login' || currentPage === 'register' || currentPage === 'forgot-password' || currentPage === 'reset-password' || currentPage === 'profile') {
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
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(p => !p)}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition active:scale-90 ${
                  isNotAdmin
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/40'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showRoleMenu && (
                <>
                  <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.preventDefault(); setShowRoleMenu(false); }} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[180px]">
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
                  </div>
                </>
              )}
            </div>
          )}

          {/* Regular admin + canDrive — 2-segment pill toggle */}
          {user.role === 'admin' && user.canDrive && (
            <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
              <button
                onPointerDown={(e) => { e.preventDefault(); switchToAdminMode(); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-extrabold transition-transform active:scale-95 ${
                  activeRole !== 'driver' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                Admin
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); switchToDriverMode(); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-extrabold transition-transform active:scale-95 ${
                  activeRole === 'driver' ? 'bg-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Car className="w-3 h-3" />
                Driver
              </button>
            </div>
          )}

          {/* Notification Bell */}
          <button
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
          </button>
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
