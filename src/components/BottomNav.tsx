import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { ActivePage } from '../context/AppContext';
import { Home, UserCircle, Briefcase, LayoutDashboard, CalendarDays } from 'lucide-react';

type Bubble = { id: number; x: number; y: number; btnId: string };

export const BottomNav: React.FC = () => {
  const { currentPage, setCurrentPage, user, isPreviewMode, activeRole, isSheetOpen } = useApp();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  const addBubble = (e: React.MouseEvent<HTMLButtonElement>, btnId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now() + Math.random();
    setBubbles(prev => [...prev, { id, x, y, btnId }]);
    setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== id)), 700);
  };

  if (currentPage === 'splash' || currentPage === 'login' || currentPage === 'register' || currentPage === 'forgot-password' || currentPage === 'reset-password') {
    return null;
  }

  if (!user.isLoggedIn) return null;
  if (isSheetOpen) return null;

  const role = isPreviewMode ? 'customer' : (activeRole === 'driver' ? 'driver' : user.role);

  const driverItems = [
    { id: 'driver-home'       as ActivePage, label: 'Jobs',      icon: Briefcase,       badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,    badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,      badge: false },
  ];

  const riderItems = [
    { id: 'rider-home'        as ActivePage, label: 'Jobs',      icon: Briefcase,       badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,    badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,      badge: false },
  ];

  const adminItems = [
    { id: 'admin-home'        as ActivePage, label: 'Dashboard', icon: LayoutDashboard, badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,    badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,      badge: false },
  ];

  const customerItems = [
    { id: 'dashboard'         as ActivePage, label: 'Home',      icon: Home,            badge: false },
    { id: 'academic-calendar' as ActivePage, label: 'Calendar',  icon: CalendarDays,    badge: false },
    { id: 'profile'           as ActivePage, label: 'Profile',   icon: UserCircle,      badge: false },
  ];

  const items =
    role === 'driver'                         ? driverItems  :
    role === 'rider'                          ? riderItems   :
    role === 'superadmin' || role === 'admin' ? adminItems   :
    customerItems;

  return (
    <>
      <style>{`
        @keyframes glass-bubble {
          0%   { transform: translate(-50%,-50%) scale(0);    opacity: 0.9; }
          35%  { transform: translate(-50%,-50%) scale(1.15); opacity: 0.75; }
          60%  { transform: translate(-50%,-50%) scale(0.95); opacity: 0.55; }
          80%  { transform: translate(-50%,-50%) scale(1.05); opacity: 0.3; }
          100% { transform: translate(-50%,-50%) scale(1.4);  opacity: 0; }
        }
        @keyframes glass-sheen {
          0%   { opacity: 0.8; transform: translate(-50%,-50%) scale(0) rotate(0deg); }
          40%  { opacity: 0.5; }
          100% { opacity: 0;   transform: translate(-50%,-50%) scale(1.4) rotate(15deg); }
        }
      `}</style>
      <div
        className="shrink-0 bg-slate-50 px-4 pt-1"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
      >
        <nav className="bg-white border border-slate-100 rounded-3xl px-2 py-1.5 flex items-center justify-around shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={(e) => { addBubble(e, item.id); setCurrentPage(item.id); }}
                className="relative flex flex-col items-center justify-center py-1 px-3 min-w-[64px] transition-all duration-300 rounded-2xl active:scale-90 overflow-hidden"
                aria-label={item.label}
              >
                {/* Liquid Glass bubbles */}
                {bubbles.filter(b => b.btnId === item.id).map(b => (
                  <React.Fragment key={b.id}>
                    {/* Outer glass bubble — rim + gradient body */}
                    <span
                      style={{
                        position: 'absolute',
                        left: b.x,
                        top: b.y,
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.04) 70%, transparent 100%)',
                        border: '1.5px solid rgba(255,255,255,0.7)',
                        boxShadow: 'inset 0 1.5px 3px rgba(255,255,255,0.8), 0 2px 12px rgba(0,0,0,0.08)',
                        animation: 'glass-bubble 0.65s cubic-bezier(0.34,1.2,0.64,1) forwards',
                        pointerEvents: 'none',
                      }}
                    />
                    {/* Inner specular hot-spot */}
                    <span
                      style={{
                        position: 'absolute',
                        left: b.x - 10,
                        top: b.y - 10,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.9) 0%, transparent 70%)',
                        animation: 'glass-sheen 0.65s ease-out forwards',
                        pointerEvents: 'none',
                      }}
                    />
                  </React.Fragment>
                ))}

                <div className={`p-1 rounded-xl transition-all duration-300 relative ${
                  isActive
                    ? 'bg-primary/10 text-primary scale-110'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}>
                  <Icon className="w-4.5 h-4.5" />
                  {item.badge && (
                    <>
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-danger rounded-full border-2 border-white animate-ping" />
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-danger rounded-full border-2 border-white" />
                    </>
                  )}
                </div>

                <span className={`text-xs mt-0.5 font-bold transition-all duration-200 ${
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
      </div>
    </>
  );
};
