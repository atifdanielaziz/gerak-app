import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Car, GraduationCap, ArrowRight, Sparkles, KeyRound, ShoppingBasket } from 'lucide-react';

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
    <div className="flex flex-col h-full bg-slate-50/50 animate-fade-in">

      {/* STICKY TOP: Greeting + Active Ride + Carousel */}
      <div className="shrink-0 px-4">

      {/* 1. Student Greeting Panel */}
      <div className="mt-4 mb-4 bg-gradient-to-r from-red-700 to-red-500 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        {/* Abstract background shapes */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute right-12 -top-12 w-20 h-20 bg-white/10 rounded-full blur-lg pointer-events-none" />
        
        <div className="flex items-center justify-between mb-3 relative z-10">
          <div className="flex items-center gap-1 bg-white/10 backdrop-blur-xs border border-white/20 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold tracking-wider">
            <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-spin" />
            Verified Campus Account
          </div>
          <span className="text-[10px] text-white/70 font-extrabold tracking-widest">{user.matricNo}</span>
        </div>

        <h2 className="text-xl font-bold font-heading m-0 leading-none">
          Hello, {toTitleCase(user.name).split(' ')[0]}!
        </h2>
        <p className="text-xs text-white/80 font-medium mt-1 mb-3">
          Where would you like to gerak today?
        </p>

      </div>

      {/* 2. Floating Tickers for Active Tasks */}
      {(activeRide !== null && activeRide.status !== 'completed') && (
        <div 
          onClick={() => setCurrentPage('transport')}
          className="mb-4 bg-blue-50 border border-blue-100 active:bg-blue-100/50 rounded-2xl p-3 shadow-md flex items-center justify-between cursor-pointer animate-pulse-glow active:scale-[0.99] transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-md">
              <Car className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="text-[10px] text-blue-600 font-extrabold tracking-wider">Active Shuttle Booking</div>
              <div className="text-xs font-black text-slate-800">
                {activeRide.status === 'searching' && 'Searching for Driver'}
                {activeRide.status === 'assigned' && 'Driver Assigned'}
                {activeRide.status === 'arriving' && 'Driver is Arriving'}
                {activeRide.status === 'active' && 'Trip In Progress'}
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-500" />
        </div>
      )}

      {/* 3. Promo Banner Carousel */}
      <div
        className="mb-6 relative overflow-hidden rounded-3xl shadow-lg"
        style={{ height: 148 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {banners.map((ban, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 bg-gradient-to-br ${ban.gradient} p-4 text-white flex flex-col justify-between transition-all duration-500 ${
              idx === activeBanner ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
            }`}
          >
            {/* Decorative emoji blob */}
            <div className="absolute -right-4 -top-4 text-7xl opacity-20 select-none pointer-events-none">
              {ban.emoji}
            </div>

            {/* Tag */}
            <span className="self-start bg-white/20 border border-white/25 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold tracking-wider">
              {ban.tag}
            </span>

            {/* Content + CTA */}
            <div className="flex items-end justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-black leading-tight m-0">{ban.title}</h4>
                <p className="text-[10px] text-white/80 font-medium leading-snug mt-1 line-clamp-2">
                  {ban.subtitle}
                </p>
              </div>
              <button
                onClick={() => setCurrentPage(ban.page)}
                className="shrink-0 bg-white/20 active:bg-white/30 border border-white/30 rounded-xl px-3 py-2 text-[10px] font-extrabold whitespace-nowrap active:scale-95 transition flex items-center gap-1"
              >
                {ban.cta} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Dot indicators — clickable */}
        <div className="absolute bottom-3 left-4 flex gap-1.5 z-10">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveBanner(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === activeBanner ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>

      </div>

      {/* SCROLLABLE: Campus Modules */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-24">

      {/* 4. Large Service Cards (Grid) */}
      <h3 className="text-xs font-black text-slate-400 tracking-widest mb-3 pl-1">
        Campus Modules
      </h3>

      <div className="flex flex-col gap-4">
        
        {/* A. Transportation Module */}
        <div
          onClick={() => setCurrentPage('transport')}
          className="group relative bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer shadow-sm active:scale-[0.99] active:shadow-md transition duration-200"
        >
          <div className="absolute left-0 top-6 bottom-6 w-1 bg-primary rounded-r-lg group-active:scale-y-110 transition duration-300" />

          <div className="flex items-center gap-4 pl-1">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-primary flex items-center justify-center group-active:bg-primary group-active:text-white transition duration-300">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-slate-800 m-0">Gerak Car</h4>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Book point-to-point campus travel. Live path tracking.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300 group-active:text-primary group-active:translate-x-1 transition" />
        </div>

        {/* B. Jubah Delivery Module */}
        <div
          onClick={() => jubahActive ? setCurrentPage('jubah') : null}
          className={`group relative bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between shadow-sm transition duration-200 ${
            jubahActive ? 'cursor-pointer active:scale-[0.99] active:shadow-md' : 'opacity-40 cursor-not-allowed'
          }`}
        >
          <div className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-lg transition duration-300 ${jubahActive ? 'bg-blue-500 group-active:scale-y-110' : 'bg-slate-300'}`} />

          <div className="flex items-center gap-4 pl-1">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition duration-300 ${
              jubahActive ? 'bg-blue-50 text-blue-500 group-active:bg-blue-500 group-active:text-white' : 'bg-slate-100 text-slate-300'
            }`}>
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-extrabold text-slate-800 m-0">Jubah Delivery</h4>
                {!jubahActive && <span className="text-[9px] font-extrabold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">Closed</span>}
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {jubahActive ? 'Convocation robe size calculator, deliveries & returns.' : 'Service unavailable outside convocation period.'}
              </p>
            </div>
          </div>
          {jubahActive && <ArrowRight className="w-5 h-5 text-slate-300 group-active:text-blue-500 group-active:translate-x-1 transition" />}
        </div>

        {/* C. Gerak Daily Module */}
        <div
          className="group relative bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer shadow-sm active:scale-[0.99] active:shadow-md transition duration-200"
        >
          <div className="absolute left-0 top-6 bottom-6 w-1 bg-violet-500 rounded-r-lg group-active:scale-y-110 transition duration-300" />

          <div className="flex items-center gap-4 pl-1">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-500 flex items-center justify-center group-active:bg-violet-500 group-active:text-white transition duration-300">
              <ShoppingBasket className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-slate-800 m-0">Gerak Daily</h4>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Food & groceries delivered to your doorstep. Coming soon.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300 group-active:text-violet-500 group-active:translate-x-1 transition" />
        </div>

        {/* D. Gerak Rental Module */}
        <div
          onClick={() => setCurrentPage('gerak-rental')}
          className="group relative bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer shadow-sm active:scale-[0.99] active:shadow-md transition duration-200"
        >
          <div className="absolute left-0 top-6 bottom-6 w-1 bg-amber-500 rounded-r-lg group-active:scale-y-110 transition duration-300" />

          <div className="flex items-center gap-4 pl-1">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center group-active:bg-amber-500 group-active:text-white transition duration-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-slate-800 m-0">Gerak Rental</h4>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Rent campus vehicles by the hour.
              </p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300 group-active:text-amber-500 group-active:translate-x-1 transition" />
        </div>

      </div>

      </div>
    </div>
  );
};
