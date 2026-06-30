import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { NotificationItem } from '../context/AppContext';
import { BellRing, Check, Info, Car, GraduationCap, HelpCircle } from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const { notifications, markAllNotificationsRead } = useApp();

  // Proactively mark notifications read when they visit the page
  useEffect(() => {
    markAllNotificationsRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'system':
        return <Info className="w-4 h-4 text-emerald-500" />;
      case 'transport':
        return <Car className="w-4 h-4 text-blue-500" />;
      case 'jubah':
        return <GraduationCap className="w-4 h-4 text-blue-500" />;
      default:
        return <HelpCircle className="w-4 h-4 text-slate-500" />;
    }
  };

  const getIconBg = (type: NotificationItem['type']) => {
    switch (type) {
      case 'system':
        return 'bg-emerald-50 border-emerald-100 text-emerald-600';
      case 'transport':
        return 'bg-blue-50 border-blue-100 text-blue-600';
      case 'jubah':
        return 'bg-blue-50 border-blue-100 text-blue-600';
      default:
        return 'bg-slate-50 border-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4">
      
      {/* Page Header */}
      <div className="mt-4 flex items-center justify-between pl-1">
        <h2 className="text-base font-black text-slate-800 flex items-center gap-2 m-0">
          <BellRing className="w-5 h-5 text-primary" />
          Campus Inbox
        </h2>
        
        <button 
          onClick={markAllNotificationsRead}
          className="text-xs text-primary font-bold flex items-center gap-1 hover:underline p-1 active:scale-95 transition"
        >
          <Check className="w-3.5 h-3.5" />
          Mark All Read
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm flex flex-col gap-1">
        {notifications.length === 0 ? (
          <div className="text-center py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-300">
              <BellRing className="w-6 h-6" />
            </div>
            <p className="text-xs text-slate-400 italic font-semibold">
              No campus notifications. Your inbox is clean!
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div 
              key={notif.id} 
              className={`flex items-start gap-4 p-3 rounded-2xl transition hover:bg-slate-50 border border-transparent ${
                !notif.isRead ? 'bg-primary-light/40 border-primary/5' : ''
              }`}
            >
              {/* Icon Bubble */}
              <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${getIconBg(notif.type)} shadow-xs`}>
                {getIcon(notif.type)}
              </div>

              {/* Message Details */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <h4 className={`text-xs text-slate-800 m-0 leading-tight ${
                    !notif.isRead ? 'font-black' : 'font-bold'
                  }`}>
                    {notif.title}
                  </h4>
                  <span className="text-[8px] text-slate-400 font-bold whitespace-nowrap">{notif.time}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal font-semibold mt-1">
                  {notif.description}
                </p>
              </div>

              {/* Unread dot */}
              {!notif.isRead && (
                <span className="w-2 h-2 rounded-full bg-primary shrink-0 self-center animate-pulse" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Tip Banner */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3 text-emerald-800">
        <Info className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <h4 className="text-xs font-bold leading-tight m-0">Dynamic Inbox Feeds</h4>
          <p className="text-[10px] text-emerald-700 leading-normal mt-1 font-semibold">
            Track and history logs update automatically. Verify alerts here for driver coordinates and gown shipments.
          </p>
        </div>
      </div>

    </div>
  );
};
