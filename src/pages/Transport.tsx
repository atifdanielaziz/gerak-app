import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { PinLocation } from '../components/MapPicker';

const MapboxRideMap = lazy(() => import('../components/MapboxRideMap').then(m => ({ default: m.MapboxRideMap })));
import {
  Map, List, ChevronDown, ChevronUp,
  Info, CheckCircle2, RotateCcw, Users, Clock, CalendarDays, Phone, ClipboardList,
} from 'lucide-react';
import { submitRideToSheets } from '../lib/sheetsService';

// ─── Route data ───────────────────────────────────────────────────────────────

interface Route {
  from: string;
  to: string;
  fare: number;
  maxPax?: number;
  emoji: string;
}

const PEKAN_ROUTES: Route[] = [
  { from: 'DHUAM',                  to: 'UMP Pekan / Fakulti',         fare: 10,              emoji: '🏢' },
  { from: 'DHUAM',                  to: 'Gigi Coffee / Eco Shop',       fare: 7,               emoji: '☕' },
  { from: 'DHUAM',                  to: 'Tealive / MyMama',             fare: 7,               emoji: '🧋' },
  { from: 'DHUAM',                  to: 'Bandar Pekan',                 fare: 12,              emoji: '🏙️' },
  { from: 'DHUAM',                  to: 'TSK',                          fare: 45, maxPax: 3,   emoji: '🚌' },
  { from: 'UMP Pekan / Fakulti',    to: 'DHUAM',                        fare: 10,              emoji: '🏢' },
  { from: 'UMP Pekan / Fakulti',    to: 'Anywhere inside UMP',          fare: 5,               emoji: '🏫' },
  { from: 'UMP Pekan / Fakulti',    to: 'TSK',                          fare: 45, maxPax: 3,   emoji: '🚌' },
  { from: 'UMP Pekan / Fakulti',    to: 'Kuantan',                      fare: 50,              emoji: '🏬' },
  { from: 'UMP Pekan / Fakulti',    to: 'Airport (Sultan Ahmad Shah)',  fare: 40, maxPax: 3,   emoji: '✈️' },
  { from: 'UMP Pekan / Fakulti',    to: 'UMP Gambang',                  fare: 55,              emoji: '🚗' },
  { from: 'UMP Pekan / Fakulti',    to: 'Terminal Bas Pekan',           fare: 15, maxPax: 3,   emoji: '🚎' },
  { from: 'UMP Pekan / Fakulti',    to: 'TMG Mart Peramu',              fare: 12,              emoji: '🛒' },
  { from: 'UMP Pekan / Fakulti',    to: 'MR DIY / ECO Peramu',         fare: 13,              emoji: '⚒️' },
  { from: 'UMP Pekan / Fakulti',    to: "McDonald's",                   fare: 7,               emoji: '🍔' },
  { from: 'UMP Pekan / Fakulti',    to: 'Bowling Pekan',                fare: 7,               emoji: '🎳' },
  { from: 'UMP Pekan / Fakulti',    to: 'Pantai Selamat',               fare: 10,              emoji: '🏖️' },
  { from: 'UMP Pekan / Fakulti',    to: 'Kawasan Mentiga',              fare: 10,              emoji: '🏤' },
  { from: 'UMP Pekan / Fakulti',    to: 'Pantai Lagenda',               fare: 8,               emoji: '🌊' },
  { from: 'UMP Pekan / Fakulti',    to: 'Taman Beruas Jaya',            fare: 7,               emoji: '🏡' },
  { from: 'Taman Beruas',           to: 'Bandar Pekan',                 fare: 18,              emoji: '🏬' },
];

const GAMBANG_ROUTES: Route[] = [
  { from: 'UMP Gambang',            to: 'Anywhere inside UMP',            fare: 5,             emoji: '🏫' },
  { from: 'UMP Gambang',            to: 'Court Prima (KK4)',               fare: 5,             emoji: '🏢' },
  { from: 'UMP Gambang',            to: '7E / Petron / Baroqah Laundry',  fare: 6,             emoji: '🏪' },
  { from: 'UMP Gambang',            to: 'Bus Stop UMP',                    fare: 6,             emoji: '🚌' },
  { from: 'UMP Gambang',            to: 'Pasar Malam / Caltex / TMG / Tasik Paya Besar', fare: 7, emoji: '🌆' },
  { from: 'UMP Gambang',            to: 'Taman Prima',                     fare: 7,             emoji: '🏘️' },
  { from: 'UMP Gambang',            to: 'Marrybrown',                      fare: 7,             emoji: '🍗' },
  { from: 'UMP Gambang',            to: 'Suraya',                          fare: 8,             emoji: '🏪' },
  { from: 'UMP Gambang',            to: 'Gambang Jaya',                    fare: 8,             emoji: '🏙️' },
  { from: 'UMP Gambang',            to: 'Mr. DIY',                         fare: 9,             emoji: '⚒️' },
  { from: 'UMP Gambang',            to: 'Gambang Damai',                   fare: 15,            emoji: '🏡' },
  { from: 'UMP Gambang',            to: 'Jaya Gading',                     fare: 15,            emoji: '🏘️' },
  { from: 'UMP Gambang',            to: 'Taman Tas',                       fare: 18,            emoji: '🌳' },
  { from: 'UMP Gambang',            to: 'Airport (Sultan Ahmad Shah)',      fare: 18,            emoji: '✈️' },
  { from: 'UMP Gambang',            to: "McDonald's Sg. Isap",             fare: 24,            emoji: '🍔' },
  { from: 'UMP Gambang',            to: 'Air Terjun Pandan',               fare: 27,            emoji: '💧' },
  { from: 'UMP Gambang',            to: 'TSK',                             fare: 28,            emoji: '🚌' },
  { from: 'UMP Gambang',            to: 'ECM / KCM',                       fare: 32,            emoji: '🏬' },
  { from: 'UMP Gambang',            to: 'Pantai Kempadang',                fare: 34,            emoji: '🏖️' },
  { from: 'UMP Gambang',            to: 'IM (IIUM Kuantan)',               fare: 35,            emoji: '🏫' },
  { from: 'UMP Gambang',            to: 'Teluk Cempedak',                  fare: 35,            emoji: '🌊' },
  { from: 'UMP Gambang',            to: 'Pantai Sepat',                    fare: 42,            emoji: '🌊' },
  { from: 'UMP Gambang',            to: 'Pantai Balok',                    fare: 45,            emoji: '🌊' },
  { from: 'UMP Gambang',            to: 'Pekan',                           fare: 60,            emoji: '🏙️' },
  { from: 'CFS IIUM Gambang',       to: 'Bus Stop UMP',                    fare: 11,            emoji: '🚌' },
  { from: 'CFS IIUM Gambang',       to: 'Taman Tas',                       fare: 22,            emoji: '🌳' },
  { from: 'CFS IIUM Gambang',       to: 'TSK',                             fare: 34,            emoji: '🚌' },
  { from: 'CFS IIUM Gambang',       to: 'IIUM Kuantan',                    fare: 37,            emoji: '🏫' },
  { from: 'CFS IIUM Gambang',       to: 'ECM / KCM',                       fare: 37,            emoji: '🏬' },
  { from: 'CFS IIUM Gambang',       to: 'Teluk Cempedak',                  fare: 39,            emoji: '🌊' },
];

const CAMPUS_CENTERS: Record<string, [number, number]> = {
  pekan:   [103.417, 3.517],
  gambang: [103.170, 3.745],
};

const CAMPUS_FROM: Record<string, string[]> = {
  pekan:   ['DHUAM', 'UMP Pekan / Fakulti', 'Taman Beruas'],
  gambang: ['UMP Gambang', 'CFS IIUM Gambang'],
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Transport: React.FC = () => {
  const { user, setCurrentPage } = useApp();

  // Page state
  const [campus,   setCampus]   = useState<'pekan' | 'gambang'>(
    user.campus?.toLowerCase() === 'pekan' ? 'pekan' : 'gambang'
  );
  const [bookMode, setBookMode] = useState<'quick' | 'map'>('quick');
  const [showInfo, setShowInfo] = useState(true);

  // Quick-route state
  const [selectedFrom,  setSelectedFrom]  = useState('');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showRouteList, setShowRouteList] = useState(false);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const fromDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fromDropdownRef.current && !fromDropdownRef.current.contains(e.target as Node)) {
        setShowFromDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Map-pin state
  const [pickupPin,  setPickupPin]  = useState<PinLocation | null>(null);
  const [destPin,    setDestPin]    = useState<PinLocation | null>(null);

  // Order form
  const [date,       setDate]       = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10); // yyyy-MM-dd
  });
  const [time,       setTime]       = useState(() => {
    const now = new Date();
    const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * (15 * 60000));
    return `${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`;
  });
  const [passengers, setPassengers] = useState(1);
  const [contact,    setContact]    = useState(user?.phone ?? '');
  const [notes,      setNotes]      = useState('');

  // Submission
  const [booking,          setBooking]          = useState(false);
  const [bookingDone,      setBookingDone]      = useState(false);
  const [bookingError,     setBookingError]     = useState<string | null>(null);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [editBlocked,      setEditBlocked]      = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────────

  const routes = campus === 'pekan' ? PEKAN_ROUTES : GAMBANG_ROUTES;
  const fromOptions = CAMPUS_FROM[campus];

  const filteredRoutes = useMemo(
    () => routes.filter(r => r.from === selectedFrom),
    [routes, selectedFrom]
  );

  const isNight = useMemo(() => {
    if (!time) return false;
    const [h] = time.split(':').map(Number);
    return h >= 0 && h < 7;
  }, [time]);

  const baseFare: number | 'TBC' = bookMode === 'quick'
    ? (selectedRoute?.fare ?? 0)
    : 'TBC';

  const nightCharge = isNight ? 5 : 0;

  const totalFare = baseFare === 'TBC'
    ? 'TBC'
    : baseFare + nightCharge;

  const pickupLabel = bookMode === 'quick'
    ? (selectedRoute ? selectedRoute.from : '')
    : (pickupPin?.address ?? '');

  const destLabel = bookMode === 'quick'
    ? (selectedRoute ? selectedRoute.to : '')
    : (destPin?.address ?? '');

  const canBook =
    !!date && !!time && !!contact &&
    (bookMode === 'quick' ? !!selectedRoute : !!(pickupPin && destPin));

  // ── Handlers ────────────────────────────────────────────────────────────────

  const switchCampus = (c: 'pekan' | 'gambang') => {
    setCampus(c);
    setSelectedFrom('');
    setSelectedRoute(null);
    setShowRouteList(false);
    setShowFromDropdown(false);
    setPickupPin(null);
    setDestPin(null);
  };

  const handleBook = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!canBook) return;
    setBooking(true);
    setEditBlocked(false);
    setBookingError(null);

    const campusLabel = campus === 'pekan' ? 'Pekan' : 'Gambang';
    const orderPayload = {
      customer_name: user.name || 'Student',
      campus:        campusLabel,
      date,
      time,
      pickup:        pickupLabel,
      destination:   destLabel,
      passengers,
      contact,
      fare:          baseFare === 'TBC' ? 'TBC' : String(baseFare),
      night_charge:  nightCharge,
      notes,
      book_mode:     bookMode,
    };

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      if (submittedOrderId) {
        // Edit existing order — only succeeds if driver hasn't accepted yet
        const { data: updated } = await supabase
          .from('ride_orders')
          .update(orderPayload)
          .eq('id', submittedOrderId)
          .eq('status', 'pending')
          .select('id');

        if (!updated || updated.length === 0) {
          setEditBlocked(true);
          setBooking(false);
          setBookingDone(true);
          return;
        }
      } else {
        // New booking
        const { data, error } = await supabase
          .from('ride_orders')
          .insert({ ...orderPayload, customer_id: authUser.id, status: 'pending' })
          .select('id')
          .single();

        if (error || !data?.id) {
          setBooking(false);
          setBookingError('Your booking could not be saved. Please check your connection and try again.');
          return;
        }
        setSubmittedOrderId(data.id);

        // Log to Google Sheets for new bookings only
        await submitRideToSheets({
          campus: campus === 'pekan' ? 'UMPSA Pekan' : 'UMPSA Gambang',
          date, time,
          pickup: pickupLabel,
          destination: destLabel,
          passengers, contact,
          fare: baseFare,
          nightCharge, notes, bookMode,
        });
      }
    }

    setBooking(false);
    setBookingDone(true);
  };

  const handleEditBooking = () => {
    setBookingDone(false);
    setEditBlocked(false);
  };

  const handleNewBooking = () => {
    setBookingDone(false);
    setSubmittedOrderId(null);
    setEditBlocked(false);
    setSelectedRoute(null);
    setShowRouteList(false);
    setSelectedFrom('');
    setPickupPin(null);
    setDestPin(null);
    const now = new Date();
    setDate(now.toISOString().slice(0, 10));
    const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * (15 * 60000));
    setTime(`${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`);
    setPassengers(1);
    setNotes('');
  };

  // ── Success screen ───────────────────────────────────────────────────────────

  if (bookingDone) {
    return (
      <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 px-4 animate-fade-in flex flex-col gap-4">
        <div className="mt-6 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 m-0">Booking Submitted!</h2>
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider mt-0.5">
                Searching for your driver
              </p>
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1 leading-relaxed">
            <p className="font-black text-slate-800 mb-2">Order Summary</p>
            <p><span className="text-slate-400">Date:</span> <span className="text-blue-600 font-bold">{date}</span></p>
            <p><span className="text-slate-400">Time:</span> <span className="text-blue-600 font-bold">{time}</span>{isNight ? ' (Night — +RM5)' : ''}</p>
            <p><span className="text-slate-400">Campus:</span> {campus === 'pekan' ? 'UMPSA Pekan' : 'UMPSA Gambang'}</p>
            <p><span className="text-slate-400">Pick-up:</span> {pickupLabel}</p>
            <p><span className="text-slate-400">Destination:</span> {destLabel}</p>
            <p><span className="text-slate-400">Passengers:</span> {passengers} pax</p>
            <p><span className="text-slate-400">Contact:</span> {contact}</p>
            <p><span className="text-slate-400">Est. Fare:</span> {totalFare === 'TBC' ? 'TBC (map booking)' : `RM${totalFare.toFixed(2)}`}</p>
            {notes && <p><span className="text-slate-400">Remark:</span> {notes}</p>}
          </div>

          {editBlocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-semibold text-center">
              A driver has accepted this ride — it can no longer be edited.
            </div>
          )}

          <div className="flex gap-2">
            {!editBlocked && (
              <button
                onClick={handleEditBooking}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold py-3 rounded-xl transition active:scale-[0.99]"
              >
                Edit Booking
              </button>
            )}
            <button
              onClick={handleNewBooking}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-extrabold py-3 rounded-xl shadow-md shadow-primary/20 transition active:scale-[0.99]"
            >
              <RotateCcw className="w-4 h-4" />
              New Booking
            </button>
          </div>

          <button
            onClick={() => setCurrentPage('my-orders')}
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-primary text-xs font-bold py-1 transition"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            View all my orders
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────

  // Drivers cannot book rides
  if (user.role === 'driver') {
    return (
      <div className="flex-grow bg-slate-50 flex flex-col items-center justify-center px-8 gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
          <Map className="w-7 h-7 text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-slate-700">Gerak Car Unavailable</p>
          <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed">
            This service is for customers only.<br />You're here to drive, not to book.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50/50 overflow-y-auto no-scrollbar pb-24 animate-fade-in">

      {/* Campus toggle — superadmin only; customers see their fixed campus */}
      <div className="px-4 pt-4 flex flex-col gap-2">
        {user.role === 'superadmin' ? (
          <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
            {(['gambang', 'pekan'] as const).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => switchCampus(c)}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all ${
                  campus === c
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {c === 'gambang' ? 'UMPSA Gambang' : 'UMPSA Pekan'}
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-primary/10 rounded-2xl px-4 py-2.5 text-center">
            <span className="text-xs font-extrabold text-primary uppercase tracking-wider">
              UMPSA {user.campus}
            </span>
          </div>
        )}

        <button
          onClick={() => setCurrentPage('my-orders')}
          className="self-end flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-primary transition"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          My Orders
        </button>
      </div>

      {/* Info notice */}
      <div className="px-4 mt-3">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInfo(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
          >
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">
                Booking Info & Prices
              </span>
            </div>
            {showInfo ? <ChevronUp className="w-3.5 h-3.5 text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-400" />}
          </button>
          {showInfo && (
            <div className="px-4 pb-3 text-[10px] text-amber-800 font-semibold leading-relaxed space-y-0.5 border-t border-amber-100">
              <p>• Bookings between <strong>12am–7am</strong> must be placed <strong>before 10pm</strong>.</p>
              <p>• Night ride (12am–7am) attracts an extra <strong>RM5 charge</strong> — applied automatically.</p>
              <p>• Maximum <strong>4 passengers</strong> per trip. Exceeding this may incur extra charge.</p>
              {campus === 'gambang' && <p>• Peak hours may also incur additional charges.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="px-4 mt-3">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setBookMode('quick')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-extrabold transition-all ${
              bookMode === 'quick'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Quick Routes
          </button>
          <button
            type="button"
            onClick={() => setBookMode('map')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-extrabold transition-all ${
              bookMode === 'map'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            Search Routes
          </button>
        </div>
      </div>

      {/* ── Quick Routes ── */}
      {bookMode === 'quick' && (
        <div className="px-4 mt-3 flex flex-col gap-3">
          {/* FROM dropdown */}
          <div ref={fromDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setShowFromDropdown(v => !v)}
              className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-primary active:scale-[0.98]"
            >
              <span className={selectedFrom ? 'text-slate-800' : 'text-slate-400 font-semibold'}>
                {selectedFrom || 'Select pickup location…'}
              </span>
              {showFromDropdown
                ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
            </button>

            {showFromDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 overflow-hidden">
                <div className="max-h-48 overflow-y-auto no-scrollbar">
                  {fromOptions.map((from, i) => (
                    <button
                      key={from}
                      type="button"
                      onClick={() => {
                        setSelectedFrom(from);
                        setSelectedRoute(null);
                        setShowRouteList(true);
                        setShowFromDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm font-semibold transition ${
                        i < fromOptions.length - 1 ? 'border-b border-slate-50' : ''
                      } ${
                        selectedFrom === from
                          ? 'bg-primary/10 text-primary font-extrabold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {from}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Route cards / selected summary */}
          {!selectedFrom ? (
            <p className="text-xs text-slate-400 font-semibold text-center py-4 italic">
              Select a pickup location above to see routes
            </p>
          ) : selectedRoute && !showRouteList ? (
            /* Collapsed: show selected route + change button */
            <button
              type="button"
              onClick={() => setShowRouteList(true)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-primary/30 bg-primary/5 ring-1 ring-primary/20 text-left transition active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{selectedRoute.emoji}</span>
                <div>
                  <p className="text-xs font-extrabold text-slate-800 leading-tight">
                    {selectedRoute.from} → {selectedRoute.to}
                  </p>
                  {selectedRoute.maxPax && (
                    <p className="text-[9px] text-amber-600 font-bold mt-0.5">Max {selectedRoute.maxPax} pax</p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className="text-xs font-black text-slate-800">RM{selectedRoute.fare}</span>
                <span className="block text-[8px] font-extrabold text-primary uppercase tracking-wider mt-0.5">Tap to change</span>
              </div>
            </button>
          ) : (
            /* Expanded: full scrollable list */
            <div className="flex flex-col gap-2 max-h-[272px] overflow-y-auto no-scrollbar pr-0.5">
              {filteredRoutes.map((route, i) => {
                const isSelected = selectedRoute === route;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedRoute(isSelected ? null : route);
                      if (!isSelected) setShowRouteList(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                      isSelected
                        ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20'
                        : 'bg-white border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{route.emoji}</span>
                      <div>
                        <p className="text-xs font-extrabold text-slate-800 leading-tight">
                          {route.from} → {route.to}
                        </p>
                        {route.maxPax && (
                          <p className="text-[9px] text-amber-600 font-bold mt-0.5">Max {route.maxPax} pax</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-xs font-black text-slate-800">RM{route.fare}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Search Map ── */}
      {bookMode === 'map' && (
        <div className="px-4 mt-3 flex flex-col gap-3">
          <Suspense fallback={<div className="flex justify-center py-12"><span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}>
            <MapboxRideMap
              campusCenter={CAMPUS_CENTERS[campus]}
              onPickupChange={name => setPickupPin(name ? { address: name, coords: [0, 0] } : null)}
              onDestinationChange={name => setDestPin(name ? { address: name, coords: [0, 0] } : null)}
            />
          </Suspense>
          <p className="text-[10px] text-slate-400 font-semibold text-center italic">
            Fare for map bookings will be confirmed by your driver
          </p>
        </div>
      )}

      {/* ── Order form ── */}
      <form onSubmit={handleBook} className="px-4 mt-2 flex flex-col gap-2">
        <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex flex-col gap-2.5">
          <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <CalendarDays className="w-3 h-3" /> Order Details
          </h3>

          {/* Date + Time — overlay trick: display div at 12px, real input invisible on top */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1">Date</label>
              <div className="relative h-9 group">
                <div className="absolute inset-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 flex items-center justify-between pointer-events-none group-focus-within:border-primary transition">
                  <span className={`text-xs font-bold ${date ? 'text-slate-700' : 'text-slate-400'}`}>
                    {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                  </span>
                  <CalendarDays className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <input type="date" required value={date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setDate(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ fontSize: '16px' }} />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time
                {isNight && <span className="text-amber-500 font-extrabold ml-1">+RM5</span>}
              </label>
              <div className="relative h-9 group">
                <div className={`absolute inset-0 border rounded-lg px-2.5 flex items-center justify-between pointer-events-none group-focus-within:border-primary transition ${
                  isNight ? 'border-amber-300 bg-amber-50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className={`text-xs font-bold ${!time ? 'text-slate-400' : isNight ? 'text-amber-700' : 'text-slate-700'}`}>
                    {time || 'Select time'}
                  </span>
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
                <input type="time" required value={time}
                  onChange={e => setTime(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{ fontSize: '16px' }} />
              </div>
            </div>
          </div>

          {/* Passengers stepper */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Number of Passengers
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPassengers(p => Math.max(1, p - 1))}
                className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-extrabold text-sm active:bg-slate-100 active:scale-95 transition flex items-center justify-center shrink-0">−</button>
              <span className="flex-1 text-center font-black text-xs text-slate-800">{passengers}</span>
              <button type="button" onClick={() => setPassengers(p => Math.min(8, p + 1))}
                className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-extrabold text-sm active:bg-slate-100 active:scale-95 transition flex items-center justify-center shrink-0">+</button>
            </div>
            {passengers > 4 && (
              <p className="text-[10px] text-amber-600 font-bold pl-1">Over 4 pax — extra charge may apply</p>
            )}
          </div>

          {/* Contact — overlay: transparent real input, 12px display div, red caret */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1">
              <Phone className="w-3 h-3" /> Contact Number
            </label>
            <div className="relative h-9 group">
              <div className="absolute inset-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 flex items-center pointer-events-none group-focus-within:border-primary transition">
                <span className={`text-xs font-bold ${contact ? 'text-slate-700' : 'text-slate-400'}`}>
                  {contact || 'e.g. 0123456789'}
                </span>
              </div>
              <input type="tel" required value={contact}
                onChange={e => setContact(e.target.value)}
                className="absolute inset-0 w-full h-full rounded-lg bg-transparent focus:outline-none cursor-text"
                style={{ fontSize: '16px', color: 'transparent', caretColor: '#EF4444' }}
                autoComplete="tel" />
            </div>
          </div>

          {/* Remark — same overlay pattern */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1">
              Remark for Driver (optional)
            </label>
            <div className="relative h-9 group">
              <div className="absolute inset-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 flex items-center pointer-events-none group-focus-within:border-primary transition">
                <span className={`text-xs font-bold truncate ${notes ? 'text-slate-700' : 'text-slate-400'}`}>
                  {notes || 'e.g. luggage, wheelchair, main gate...'}
                </span>
              </div>
              <input type="text" value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 500))}
                maxLength={500}
                className="absolute inset-0 w-full h-full rounded-lg bg-transparent focus:outline-none cursor-text"
                style={{ fontSize: '16px', color: 'transparent', caretColor: '#EF4444' }}
                autoComplete="off" autoCorrect="off" />
            </div>
          </div>
        </div>

        {/* Fare summary */}
        <div className="bg-white border border-slate-100 rounded-xl px-3.5 py-2.5 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Estimated Fare</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base font-black text-slate-800">
                {totalFare === 'TBC' ? 'TBC' : `RM${totalFare.toFixed(2)}`}
              </span>
              {isNight && baseFare !== 'TBC' && (
                <span className="text-[10px] font-bold text-amber-500">incl. night +RM5</span>
              )}
            </div>
          </div>
        </div>

        {bookingError && (
          <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-xs text-danger font-bold text-center">
            {bookingError}
          </div>
        )}

        {/* Book button */}
        <button
          type="submit"
          disabled={!canBook || booking}
          className={`mx-auto flex items-center gap-2 text-white text-sm font-extrabold px-8 py-2 rounded-full transition-all duration-300 active:scale-95 ${
            canBook && !booking
              ? 'bg-primary hover:bg-primary-hover shadow-lg shadow-primary/50 ring-2 ring-primary/40 animate-pulse-glow cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {booking ? (
            <span className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Book
            </>
          )}
        </button>

        {!canBook && (
          <p className="text-[10px] text-slate-400 font-semibold text-center -mt-1">
            {bookMode === 'quick' && !selectedRoute ? 'Select a route above to continue' : ''}
            {bookMode === 'map' && !(pickupPin && destPin) ? 'Drop both pins on the map to continue' : ''}
            {!(date && time) ? 'Fill in date and time to continue' : ''}
          </p>
        )}
      </form>
    </div>
  );
};
