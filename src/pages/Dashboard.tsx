import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Car, GraduationCap, ArrowRight, ChevronRight, ShieldCheck, KeyRound, ShoppingBasket, Truck } from 'lucide-react';

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
          <>
            <img src="/gerak-brand.png" alt="Gerak" className="w-20 h-auto" />
            <p className="text-xs text-slate-400 font-normal mt-0.5">Smart Campus Platform</p>
          </>
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
      <div
        className="mb-6 relative overflow-hidden rounded-3xl border border-slate-100"
        style={{ height: 148 }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {banners.map((ban, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 bg-white p-4 flex flex-col justify-between transition-all duration-500 ${
              idx === activeBanner ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
            }`}
          >
            {/* Decorative emoji blob */}
            <div className="absolute -right-4 -top-4 text-7xl opacity-[0.06] select-none pointer-events-none text-slate-900">
              {ban.emoji}
            </div>

            {/* Tag */}
            <span className="self-start bg-slate-100 text-slate-500 rounded-xl px-2.5 py-0.5 text-xs font-semibold">
              {ban.tag}
            </span>

            {/* Content + CTA */}
            <div className="flex items-end justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-800 leading-tight m-0">{ban.title}</h4>
                <p className="text-xs text-slate-400 font-normal leading-snug mt-1 line-clamp-2">
                  {ban.subtitle}
                </p>
              </div>
              <button
                onClick={() => setCurrentPage(ban.page)}
                className="shrink-0 bg-primary text-white rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap active:scale-95 transition flex items-center gap-1"
              >
                {ban.cta} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Dot indicators */}
        <div className="absolute bottom-3 left-4 flex gap-1.5 z-10">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onPointerDown={e => { e.preventDefault(); setActiveBanner(idx); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === activeBanner ? 'w-5 bg-primary' : 'w-1.5 bg-slate-200'
              }`}
            />
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
        
        {/* A. Transportation Module */}
        <div
          onClick={() => setCurrentPage('transport')}
          className="bg-white border border-slate-100 rounded-3xl p-5 flex items-center justify-between cursor-pointer active:scale-[0.99] active:bg-slate-50 transition duration-200"
        >
          <div className="flex items-center gap-3">
            <Car className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <h4 className="text-base font-semibold text-slate-800 m-0 leading-tight">Gerak Car</h4>
              <p className="text-xs text-slate-400 font-normal mt-0.5">
                Book point-to-point campus travel. Live path tracking.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
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
              <GraduationCap className="w-5 h-5 text-slate-400 shrink-0" />
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
            <ShoppingBasket className="w-5 h-5 text-slate-400 shrink-0" />
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
            <KeyRound className="w-5 h-5 text-slate-400 shrink-0" />
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
            <Truck className="w-5 h-5 text-slate-400 shrink-0" />
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
