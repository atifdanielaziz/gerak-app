import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, ChevronLeft, ShieldCheck, Car, Bike, MoreHorizontal, Eye } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentPage, setCurrentPage, goBack, canGoBack, notifications, user,
    activeRole, isPreviewMode,
    switchToAdminMode, switchToDriverMode, switchToRiderMode, enterPreviewMode,
  } = useApp();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (currentPage === 'splash' || currentPage === 'login' || currentPage === 'register' || currentPage === 'forgot-password' || currentPage === 'reset-password') {
    return null;
  }

  // Guest mode — simplified header
  if (!user.isLoggedIn) {
    return (
      <header
        className="sticky top-0 z-40 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-1 shadow-sm"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
      >
        <button
          onClick={() => setCurrentPage('login')}
          className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-90 transition text-slate-600 mr-0.5"
          aria-label="Back to login"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center shrink-0">
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.3rem', color: '#0F172A', lineHeight: 1, fontWeight: 900 }}>g</span>
          </div>
          <h1 className="text-lg tracking-tight text-slate-800 m-0 leading-none" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
            ger<span style={{ color: '#EF4444' }}>a</span>k
          </h1>
        </div>
      </header>
    );
  }

  const isNotAdmin = isPreviewMode || activeRole === 'driver' || activeRole === 'rider';

  return (
    <>
      <header
        className="sticky top-0 z-40 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between shadow-sm"
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
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-[9px] font-extrabold transition active:scale-95 ${
                  activeRole !== 'driver' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                Admin
              </button>
              <button
                onClick={switchToDriverMode}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-[9px] font-extrabold transition active:scale-95 ${
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
              <span className="absolute top-1 right-1 w-4.5 h-4.5 bg-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>
    </>
  );
};
