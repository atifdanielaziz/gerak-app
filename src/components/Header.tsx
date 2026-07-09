import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, ChevronLeft, ShieldCheck, Car, Bike, MoreHorizontal, Eye, ChevronDown, X, MapPin } from 'lucide-react';

const UNI_CAMPUSES: Record<string, string[]> = {
  'UMPSA': ['Pekan', 'Gambang'],
};
const UNIVERSITIES = Object.keys(UNI_CAMPUSES);

export const Header: React.FC = () => {
  const {
    currentPage, setCurrentPage, goBack, canGoBack, notifications, user,
    activeRole, isPreviewMode,
    switchToAdminMode, switchToDriverMode, switchToRiderMode, enterPreviewMode,
    showAuthGate, guestCampus, setGuestCampus,
  } = useApp();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showCampusSheet, setShowCampusSheet] = useState(false);
  const [sheetStep, setSheetStep] = useState<'university' | 'campus'>('university');
  const [tempUni, setTempUni] = useState('');
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (currentPage === 'splash' || currentPage === 'login' || currentPage === 'register' || currentPage === 'forgot-password' || currentPage === 'reset-password') {
    return null;
  }

  // Guest mode — header with campus selector + bell
  if (!user.isLoggedIn) {
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
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0">
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.3rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
            </div>
            <h1 className="text-lg tracking-tight text-slate-800 m-0 leading-none" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
              ger<span style={{ color: '#EF4444' }}>a</span>k
            </h1>
          </div>

          {/* Right: campus picker + bell */}
          <div className="flex items-center gap-2">
            <button
              onClick={openSheet}
              className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-3 py-2 active:bg-slate-200 transition active:scale-95"
            >
              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700 max-w-[120px] truncate">
                {guestCampus || 'Select Campus'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>
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
            onClick={closeSheet}
          >
            <div
              className="w-full bg-white rounded-t-3xl shadow-2xl max-h-[70dvh] flex flex-col animate-slide-up"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}
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
                        className={`w-full flex items-center justify-between px-4 py-4 border rounded-2xl active:scale-[0.99] transition ${
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-slate-100 bg-white active:bg-slate-50'
                        }`}
                      >
                        <span className={`text-sm font-semibold ${selected ? 'text-primary' : 'text-slate-800'}`}>
                          {tempUni} {campus}
                        </span>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-primary bg-primary' : 'border-slate-300'
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
        {/* Left: Back button + Branding */}
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
          <div
            className="flex items-center gap-2 cursor-pointer transition active:scale-95"
            onClick={() => {
              if (activeRole === 'driver') setCurrentPage('driver-home');
              else if (activeRole === 'admin') setCurrentPage('admin-home');
              else if (user.role === 'driver') setCurrentPage('driver-home');
              else if (user.role === 'admin' || user.role === 'superadmin') setCurrentPage('admin-home');
              else setCurrentPage('dashboard');
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center shrink-0">
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.3rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
            </div>
            <h1 className="text-lg tracking-tight text-slate-800 m-0 leading-none" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
              ger<span style={{ color: '#EF4444' }}>a</span>k
            </h1>
          </div>
        </div>

        {/* Right: role switcher + bell */}
        <div className="flex items-center gap-2">

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
                  <div className="fixed inset-0 z-40" onClick={() => setShowRoleMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden min-w-[180px]">
                    <button
                      onClick={() => { switchToAdminMode(); setShowRoleMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold transition active:scale-95 ${
                        !isNotAdmin ? 'bg-primary/5 text-primary' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      Admin
                      {!isNotAdmin && <span className="ml-auto text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Active</span>}
                    </button>

                    <button
                      onClick={() => { switchToDriverMode(); setShowRoleMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-extrabold transition active:scale-95 ${
                        activeRole === 'driver' ? 'bg-primary/5 text-primary' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Car className="w-4 h-4 shrink-0" />
                      Driver
                      {activeRole === 'driver' && <span className="ml-auto text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Active</span>}
                    </button>

                    <button
                      onClick={() => { switchToRiderMode(); setShowRoleMenu(false); }}
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
                onClick={switchToAdminMode}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-extrabold transition active:scale-95 ${
                  activeRole !== 'driver' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                Admin
              </button>
              <button
                onClick={switchToDriverMode}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-extrabold transition active:scale-95 ${
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
    </>
  );
};
