import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Car, GraduationCap, ArrowRight, ChevronRight, ShieldCheck, KeyRound, ShoppingBasket, Truck, Circle, Minus } from 'lucide-react';

const toTitleCase = (str: string) =>
  str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

interface Banner {
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  page: 'transport' | 'jubah' | 'profile' | 'dashboard';
  emoji: string;
  gradient: string;
  imageUrl?: string;
}

const FALLBACK_BANNERS: Banner[] = [
  {
    tag:      '🚗 Ride',
    title:    'Book Your Ride Now',
    subtitle: 'Quick routes around campus, DHUAM, Bandar Pekan & more. Fast, affordable, reliable.',
    cta:      'Book a Ride',
    page:     'transport',
    emoji:    '🛺',
    gradient: 'from-emerald-700 via-emerald-600 to-teal-500',
  },
  {
    tag:      '🎓 Jubah',
    title:    'Convocation 2026',
    subtitle: 'Reserve your graduation robe early. Dorm drop-off available for all faculties.',
    cta:      'Reserve Now',
    page:     'jubah',
    emoji:    '🎓',
    gradient: 'from-blue-700 via-blue-600 to-indigo-500',
  },
  {
    tag:      '🗺️ New',
    title:    'Search Routes on Map',
    subtitle: 'Pin your exact pickup & destination anywhere in Malaysia. Driver confirmed fare.',
    cta:      'Try It Now',
    page:     'transport',
    emoji:    '📍',
    gradient: 'from-violet-600 via-purple-600 to-fuchsia-500',
  },
];

export const Dashboard: React.FC = () => {
  const { user, setCurrentPage, activeRide } = useApp();
  const [activeBanner, setActiveBanner] = useState(0);
  const [banners, setBanners] = useState<Banner[]>(FALLBACK_BANNERS);
  const [jubahActive, setJubahActive] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX   = useRef(0);

  // Fetch Jubah period status
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'jubah_active')
      .single()
      .then(({ data }) => { if (data) setJubahActive(data.value === 'true'); });
  }, []);

  // Fetch active announcements from Supabase; fall back to hardcoded if none
  useEffect(() => {
    supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setBanners(data.map(a => ({
            tag:      a.tag,
            title:    a.title,
            subtitle: a.subtitle,
            cta:      a.cta_label,
            page:     a.cta_page as Banner['page'],
            emoji:    a.emoji,
            gradient: a.gradient,
            imageUrl: typeof a.gradient === 'string' && a.gradient.startsWith('image:')
              ? a.gradient.slice(6)
              : undefined,
          })));
        }
      });
  }, []);

  // Auto-rotate
  useEffect(() => {
    const t = setInterval(() => setActiveBanner(p => (p + 1) % banners.length), 4500);
    return () => clearInterval(t);
  }, [banners.length]);

  // Swipe handlers
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      setActiveBanner(p => diff > 0
        ? (p + 1) % banners.length
        : (p - 1 + banners.length) % banners.length);
    }
  };

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">

      {/* Greeting + Active Ride + Carousel */}
      <div className="px-4">

      {/* 1. Hero Panel */}
      <div className="mt-4 mb-4 bg-white border border-slate-100 rounded-3xl p-5">
        {user.isLoggedIn ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs font-normal text-emerald-600">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Verified Campus Account
              </span>
              <span className="text-xs text-slate-400 font-normal">{user.matricNo}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 m-0 leading-tight">
              Hello, {toTitleCase(user.name).split(' ')[0]}!
            </h2>
            <p className="text-xs text-slate-400 font-normal mt-1">
              Smart {user.university || 'University'} Service Platform
            </p>
          </>
        ) : (
          // Icon split from the wordmark instead of the stacked gerak-brand.png
          // lockup, which left most of the card's width empty. A large, faint
          // copy of the same mark bleeds off the top-right corner behind the
          // real content — texture without inventing anything new to show.
          <div className="relative overflow-hidden -m-5 p-5 rounded-3xl">
            <img
              src="/gerak-icon-transparent.png"
              alt=""
              aria-hidden="true"
              className="absolute -right-3.5 -top-3.5 w-[100px] h-[100px] opacity-[0.06] pointer-events-none select-none"
            />
            <div className="relative flex items-center gap-3">
              <img src="/gerak-icon-transparent.png" alt="Gerak" className="w-10 h-10 shrink-0" />
              <div>
                <p className="text-2xl font-black text-slate-800 m-0 leading-none">
                  ger<span className="text-primary">a</span>k
                </p>
                <p className="text-xs text-slate-400 font-normal mt-1">Smart Campus Platform</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Floating Tickers for Active Tasks */}
      {(activeRide !== null && activeRide.status !== 'completed') && (
        <div 
          onClick={() => setCurrentPage('transport')}
          className="mb-4 bg-white border border-primary/20 active:bg-primary/5 rounded-2xl p-3 flex items-center justify-between cursor-pointer animate-pulse-glow active:scale-[0.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Car className="w-5 h-5 text-primary animate-bounce" />
            </div>
            <div>
              <div className="text-xs text-primary font-semibold">Active Shuttle Booking</div>
              <div className="text-xs font-semibold text-slate-800">
                {activeRide.status === 'searching' && 'Searching for Driver'}
                {activeRide.status === 'assigned' && 'Driver Assigned'}
                {activeRide.status === 'arriving' && 'Driver is Arriving'}
                {activeRide.status === 'active' && 'Trip In Progress'}
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-primary" />
        </div>
      )}

      {/* 3. Promo Banner Carousel */}
      <div className="mb-6">
        <div
          className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white aspect-[2.15/1]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {banners.map((ban, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setCurrentPage(ban.page)}
              className={`absolute inset-0 w-full h-full overflow-hidden text-left transition-all duration-500 transform-gpu ${
                idx === activeBanner ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
              }`}
            >
              {ban.imageUrl ? (
                <img src={ban.imageUrl} alt={ban.title || 'Gerak announcement'} className="w-full h-full object-cover" />
              ) : (
                <div className={`relative w-full h-full bg-gradient-to-br ${ban.gradient} p-5 text-white flex flex-col items-center justify-center text-center`}>
                  <div className="absolute -right-4 -top-5 text-8xl opacity-10 select-none pointer-events-none">{ban.emoji}</div>
                  <span className="bg-white/15 border border-white/20 rounded-xl px-2.5 py-1 text-xs font-semibold">{ban.tag}</span>
                  <h4 className="text-lg font-semibold leading-tight mt-2 m-0 max-w-[90%]">{ban.title}</h4>
                  {ban.subtitle && <p className="text-xs text-white/80 font-normal leading-snug mt-1 line-clamp-2 max-w-[90%]">{ban.subtitle}</p>}
                  {ban.cta && <span className="mt-3 bg-white/15 border border-white/20 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1">{ban.cta}<ArrowRight className="w-3 h-3" /></span>}
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1 text-slate-300" aria-label="Advertisement selector">
          {banners.map((_, idx) => (
            <button key={idx} type="button" aria-label={`Show advertisement ${idx + 1}`} onPointerDown={e => { e.preventDefault(); setActiveBanner(idx); }} className={`flex items-center justify-center transition-colors ${idx === activeBanner ? 'text-primary' : 'text-slate-200'}`}>
              {idx === activeBanner ? <Minus className="w-5 h-3 stroke-[4]" /> : <Circle className="w-2.5 h-2.5 fill-current stroke-0" />}
            </button>
          ))}
        </div>
      </div>

      </div>

      {/* Campus Modules */}
      <div className="px-4">

      <h3 className="text-sm font-bold text-slate-700 mb-3 pl-1">
        Campus Modules
      </h3>

      <div className="flex flex-col gap-4">
        
        {/* A. Transportation Module — featured: the most-booked service gets
            real visual weight instead of another identical row, which is
            what actually breaks the "every module looks the same" pattern
            (color alone on the others isn't enough on its own). */}
        <div
          onClick={() => setCurrentPage('transport')}
          className="bg-white border-[1.5px] border-slate-900 rounded-3xl p-[18px] flex items-center gap-3.5 cursor-pointer active:scale-[0.99] transition duration-200"
        >
          <div className="w-[50px] h-[50px] rounded-2xl bg-slate-900 flex items-center justify-center shrink-0">
            <Car className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-primary m-0">Most booked</p>
            <h4 className="text-[15px] font-bold text-slate-800 m-0 leading-tight mt-0.5">Gerak Car</h4>
            <p className="text-[10.5px] text-slate-400 font-normal mt-0.5 leading-snug">
              Book point-to-point campus travel. Live path tracking.
            </p>
          </div>
          <div className="w-[30px] h-[30px] rounded-[10px] bg-slate-900 flex items-center justify-center shrink-0">
            <ChevronRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        {/* B. Jubah Delivery Module — hidden entirely while closed, not just
            greyed out (was previously always visible, disabled + "Closed"
            badge; now the tile doesn't render at all outside the period). */}
        {jubahActive && (
          <div
            onClick={() => setCurrentPage('jubah')}
            className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer active:scale-[0.99] active:bg-slate-50 transition duration-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-[38px] h-[38px] rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <GraduationCap className="w-[19px] h-[19px] text-amber-500" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-slate-800 m-0 leading-tight">Jubah Delivery</h4>
                <p className="text-xs text-slate-400 font-normal mt-0.5">
                  Convocation robe size calculator, deliveries & returns.
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
          </div>
        )}

        {/* C. Gerak Daily Module */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between opacity-40 cursor-not-allowed">
          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <ShoppingBasket className="w-[19px] h-[19px] text-slate-400" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-800 m-0 leading-tight">Gerak Daily</h4>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                Food & groceries delivered to your doorstep. Coming soon.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
        </div>

        {/* D. Gerak Rental Module */}
        <div
          onClick={() => setCurrentPage('gerak-rental')}
          className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer active:scale-[0.99] active:bg-slate-50 transition duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
              <KeyRound className="w-[19px] h-[19px] text-purple-500" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-800 m-0 leading-tight">Gerak Rental</h4>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                Rent campus vehicles by the hour.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
        </div>

        {/* E. Gerak Transporter Module */}
        <div
          onClick={() => setCurrentPage('gerak-transporter')}
          className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer active:scale-[0.99] active:bg-slate-50 transition duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              <Truck className="w-[19px] h-[19px] text-orange-500" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-800 m-0 leading-tight">Gerak Transporter</h4>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                Hantar moto pintu ke pintu. Pindah barang berskala kecil.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
        </div>

      </div>

      </div>
    </div>
  );
};
