import React from 'react';
import { useApp } from '../context/AppContext';
import type { ActivePage } from '../context/AppContext';
import { Home, UserCircle, Briefcase, LayoutDashboard, CalendarDays } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { currentPage, setCurrentPage, user, isPreviewMode, activeRole } = useApp();

  if (currentPage === 'splash' || currentPage === 'login' || currentPage === 'register' || currentPage === 'forgot-password' || currentPage === 'reset-password') {
    return null;
  }

  const role = isPreviewMode ? 'customer' : (activeRole === 'driver' ? 'driver' : user.role);

  // Driver nav
  const driverItems = [
    { id: 'driver-home'       as ActivePage, label: 'Jobs',      icon: Briefcase,      badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,   badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,     badge: false },
  ];

  // Rider nav
  const riderItems = [
    { id: 'rider-home'        as ActivePage, label: 'Jobs',      icon: Briefcase,      badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,   badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,     badge: false },
  ];

  // Admin / superadmin nav
  const adminItems = [
    { id: 'admin-home'        as ActivePage, label: 'Dashboard', icon: LayoutDashboard, badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,    badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,      badge: false },
  ];

  // Customer nav
  const customerItems = [
    { id: 'dashboard'         as ActivePage, label: 'Home',     icon: Home,           badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar', icon: CalendarDays,   badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',  icon: UserCircle,     badge: false },
  ];

  const items =
    role === 'driver'                          ? driverItems  :
    role === 'rider'                           ? riderItems   :
    role === 'superadmin' || role === 'admin'  ? adminItems   :
    customerItems;

  return (
    <nav
      className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-100 px-2 pt-2 flex items-center justify-around shadow-[0_-4px_12px_rgba(0,0,0,0.03)]"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id)}
            className="relative flex flex-col items-center justify-center py-1 px-3 min-w-[64px] transition-all duration-300 rounded-2xl active:scale-90"
            aria-label={item.label}
          >
            <div className={`p-1.5 rounded-xl transition-all duration-300 relative ${
              isActive
                ? 'bg-primary/10 text-primary scale-110'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}>
              <Icon className="w-5 h-5" />
              {item.badge && (
                <>
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-danger rounded-full border-2 border-white animate-ping" />
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-danger rounded-full border-2 border-white" />
                </>
              )}
            </div>
            <span className={`text-[10px] mt-1 font-bold transition-all duration-200 ${
              isActive ? 'text-primary scale-105' : 'text-slate-400'
            }`}>
              {item.label}
            </span>
            {isActive && (
              <span className="absolute bottom-0 w-4 h-0.75 bg-primary rounded-full animate-fade-in" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
