import React, { useState, useMemo, useRef, useEffect, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
interface PinLocation { address: string; coords: [number, number]; }

const MapboxRideMap = lazy(() => import('../components/MapboxRideMap').then(m => ({ default: m.MapboxRideMap })));
import {
  Map, List, ChevronDown, PencilLine, Car,
  Info, CheckCircle2, RotateCcw, Users, Clock, CalendarDays, Phone, ClipboardList, X,
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
  const { user, setCurrentPage, showAuthGate } = useApp();

  // Page state
  const [campus,   setCampus]   = useState<'pekan' | 'gambang'>(
    user.campus?.toLowerCase() === 'pekan' ? 'pekan' : 'gambang'
  );
  const [bookMode, setBookMode] = useState<'quick' | 'custom' | 'map'>(user.isLoggedIn ? 'quick' : 'map');
  const [showTerms, setShowTerms] = useState(false);

  // Quick-route state
  const [selectedFrom,  setSelectedFrom]  = useState('');
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showRouteList, setShowRouteList] = useState(false);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const fromDropdownRef = useRef<HTMLDivElement>(null);
  const routeListRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fromDropdownRef.current && !fromDropdownRef.current.contains(e.target as Node))
        setShowFromDropdown(false);
      if (routeListRef.current && !routeListRef.current.contains(e.target as Node)) {
        setShowRouteList(false);
        setSelectedFrom('');
        setSelectedRoute(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Map-pin state
  const [pickupPin,    setPickupPin]    = useState<PinLocation | null>(null);
  const [destPin,      setDestPin]      = useState<PinLocation | null>(null);

  // Custom mode state
  const [customPickup, setCustomPickup] = useState('');
  const [customDest,   setCustomDest]   = useState('');

  // Order form
  const [bookWhen,   setBookWhen]   = useState<'now' | 'later'>('now');
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

  // Pre-fill contact when user logs in mid-session
  useEffect(() => {
    if (user.phone && !contact) setContact(user.phone);
  }, [user.phone, contact]);

  // Sync date/time to "now" whenever user picks "Now"
  useEffect(() => {
    if (bookWhen !== 'now') return;
    const now = new Date();
    setDate(now.toISOString().slice(0, 10));
    const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * (15 * 60000));
    setTime(`${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`);
  }, [bookWhen]);

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
    : bookMode === 'custom'
    ? customPickup
    : (pickupPin?.address ?? '');

  const destLabel = bookMode === 'quick'
    ? (selectedRoute ? selectedRoute.to : '')
    : bookMode === 'custom'
    ? customDest
    : (destPin?.address ?? '');

  const canBook =
    !!date && !!time && !!contact &&
    (bookMode === 'quick'  ? !!selectedRoute :
     bookMode === 'custom' ? !!(customPickup.trim() && customDest.trim()) :
     !!(pickupPin && destPin));

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
    if (!user.isLoggedIn) { showAuthGate(); return; }
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
    setCustomPickup('');
    setCustomDest('');
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
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 px-5 animate-fade-in flex flex-col gap-5">
        <div className="mt-6 bg-white border border-slate-100 rounded-3xl p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 m-0">Booking Submitted!</h2>
              <p className="text-xs text-emerald-500 font-normal mt-0.5">
                Searching for your driver
              </p>
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-2">Order Summary</p>
            <p><span className="text-slate-400">Date:</span> <span className="text-blue-600 font-semibold">{date}</span></p>
            <p><span className="text-slate-400">Time:</span> <span className="text-blue-600 font-semibold">{time}</span>{isNight ? ' (Night — +RM5)' : ''}</p>
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
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-2xl transition active:scale-[0.99]"
              >
                Edit Booking
              </button>
            )}
            <button
              onClick={handleNewBooking}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-2xl shadow-md shadow-primary/20 transition active:scale-[0.99]"
            >
              <RotateCcw className="w-4 h-4" />
              New Booking
            </button>
          </div>

          <button
            onClick={() => setCurrentPage('my-orders')}
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-primary text-xs font-normal py-1 transition"
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
      <div className="flex-grow bg-white flex flex-col items-center justify-center px-8 gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
          <Map className="w-7 h-7 text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700">Gerak Car Unavailable</p>
          <p className="text-xs text-slate-400 font-normal mt-1 leading-relaxed">
            This service is for customers only.<br />You're here to drive, not to book.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">

      {/* Header */}
      <div className="px-4 pt-5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 m-0 flex items-center gap-2">
              <Car className="w-5 h-5 text-slate-400" /> Gerak Car
            </h2>
            <p className="text-xs text-slate-400 font-normal mt-0.5">
              Point-to-point campus travel
            </p>
          </div>
        </div>
      </div>

      {/* Campus toggle — logged-in only */}
      <div className="px-4 pt-4 flex flex-col gap-2">
        {user.isLoggedIn && (
          user.role === 'superadmin' ? (
            <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
              {(['gambang', 'pekan'] as const).map(c => (
                <button
                  key={c}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); switchCampus(c); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-transform ${
                    campus === c
                      ? 'bg-white text-primary'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {c === 'gambang' ? 'UMPSA Gambang' : 'UMPSA Pekan'}
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-primary/10 rounded-2xl px-4 py-2.5 text-center">
              <span className="text-xs font-semibold text-primary">
                UMPSA {user.campus}
              </span>
            </div>
          )
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="flex items-center gap-1.5 text-xs font-normal text-slate-400 hover:text-primary transition"
          >
            <Info className="w-3.5 h-3.5" />
            Booking Terms
          </button>
          <button
            onClick={() => setCurrentPage('my-orders')}
            className="flex items-center gap-1.5 text-xs font-normal text-slate-400 hover:text-primary transition"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            My Orders
          </button>
        </div>
      </div>

      {/* Mode selector — 3 modes */}
      {user.isLoggedIn && (
        <div className="px-4 mt-3 flex gap-2">
          {([
            { key: 'quick',  icon: List,        label: 'Quick Routes'  },
            { key: 'custom', icon: PencilLine,  label: 'Custom'        },
            { key: 'map',    icon: Map,         label: 'Search Routes' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button key={key} type="button" onPointerDown={(e) => { e.preventDefault(); setBookMode(key); }}
              className={`flex-1 flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 ${
                bookMode === key ? 'border-slate-900' : 'border-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${bookMode === key ? 'text-slate-900' : 'text-slate-400'}`} />
              <span className={`text-[10px] font-semibold leading-tight text-center ${bookMode === key ? 'text-slate-900' : 'text-slate-500'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Quick Routes ── */}
      {bookMode === 'quick' && (
        <div className="px-4 mt-3 flex flex-col gap-4">
          {/* FROM dropdown */}
          <div ref={fromDropdownRef} className="relative">
            <button
              type="button"
              onPointerDown={e => { e.preventDefault(); setShowFromDropdown(v => !v); }}
              className="w-full flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition-transform active:bg-slate-50 active:scale-[0.99]"
            >
              <span className={selectedFrom ? 'text-slate-800' : 'text-slate-400 font-normal'}>
                {selectedFrom || 'Select pickup location…'}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showFromDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showFromDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 overflow-hidden">
                <div className="max-h-48 overflow-y-auto no-scrollbar">
                  {fromOptions.map((from, i) => (
                    <button
                      key={from}
                      type="button"
                      onPointerDown={e => {
                        e.preventDefault();
                        setSelectedFrom(from);
                        setSelectedRoute(null);
                        setShowRouteList(true);
                        setShowFromDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm font-normal transition ${
                        i < fromOptions.length - 1 ? 'border-b border-slate-50' : ''
                      } ${
                        selectedFrom === from
                          ? 'bg-slate-100 text-slate-900 font-semibold'
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
            <p className="text-xs text-slate-400 font-normal text-center py-4 italic">
              Select a pickup location above to see routes
            </p>
          ) : selectedRoute && !showRouteList ? (
            /* Collapsed: show selected route + change button */
            <button
              type="button"
              onClick={() => setShowRouteList(true)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-900 bg-white text-left transition active:bg-slate-50 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{selectedRoute.emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    {selectedRoute.from} → {selectedRoute.to}
                  </p>
                  {selectedRoute.maxPax && (
                    <p className="text-xs text-amber-600 font-normal mt-0.5">Max {selectedRoute.maxPax} pax</p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <span className="text-xs font-black text-slate-800">RM{selectedRoute.fare}</span>
                <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Tap to change</span>
              </div>
            </button>
          ) : (
            /* Expanded: full scrollable list */
            <div ref={routeListRef} className="flex flex-col gap-2 max-h-[272px] overflow-y-auto no-scrollbar pr-0.5">
              {filteredRoutes.map((route, i) => {
                const isSelected = selectedRoute === route;
                return (
                  <button
                    key={i}
                    type="button"
                    onPointerDown={e => {
                      e.preventDefault();
                      setSelectedRoute(isSelected ? null : route);
                      if (!isSelected) setShowRouteList(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 text-left ${
                      isSelected
                        ? 'border-slate-900'
                        : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{route.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 leading-tight">
                          {route.from} → {route.to}
                        </p>
                        {route.maxPax && (
                          <p className="text-xs text-amber-600 font-normal mt-0.5">Max {route.maxPax} pax</p>
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

      {/* ── Custom Mode ── */}
      {bookMode === 'custom' && (
        <div className="px-4 mt-3">
          <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <PencilLine className="w-4 h-4 text-slate-400" /> Custom Route
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point A — Pickup</label>
                <input
                  type="text"
                  value={customPickup}
                  onChange={e => setCustomPickup(e.target.value)}
                  placeholder="e.g. Kolej Kediaman 3, Block B"
                  className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900 transition"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point B — Destination</label>
                <input
                  type="text"
                  value={customDest}
                  onChange={e => setCustomDest(e.target.value)}
                  placeholder="e.g. FTKMA, Dewan Sri Damai"
                  className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900 transition"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-normal text-center italic">
              Fare for custom routes will be confirmed by your driver
            </p>
          </div>
        </div>
      )}

      {/* ── Search Map ── */}
      {bookMode === 'map' && (
        <div className="px-4 mt-3 flex flex-col gap-4">
          <Suspense fallback={<div className="flex justify-center py-12"><span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}>
            <MapboxRideMap
              campusCenter={CAMPUS_CENTERS[campus]}
              onPickupChange={name => setPickupPin(name ? { address: name, coords: [0, 0] } : null)}
              onDestinationChange={name => setDestPin(name ? { address: name, coords: [0, 0] } : null)}
            />
          </Suspense>
          <p className="text-xs text-slate-400 font-normal text-center italic">
            Fare for map bookings will be confirmed by your driver
          </p>
        </div>
      )}

      {/* ── Order form ── */}
      <form onSubmit={handleBook} className="px-4 mt-2 flex flex-col gap-2">
        <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-slate-400" /> Order Details
          </h3>

          {/* Now / Later toggle — Mode Selector Standard */}
          <div className="flex gap-2">
            <button type="button" onPointerDown={(e) => { e.preventDefault(); setBookWhen('now'); }}
              className={`flex-1 flex items-center gap-2 p-3 rounded-2xl border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 ${
                bookWhen === 'now' ? 'border-slate-900' : 'border-slate-100'
              }`}
            >
              <Clock className={`w-4 h-4 shrink-0 ${bookWhen === 'now' ? 'text-slate-900' : 'text-slate-400'}`} />
              <span className={`text-xs font-semibold ${bookWhen === 'now' ? 'text-slate-900' : 'text-slate-600'}`}>Now</span>
            </button>
            <button type="button" onPointerDown={(e) => { e.preventDefault(); setBookWhen('later'); }}
              className={`flex-1 flex items-center gap-2 p-3 rounded-2xl border bg-white transition-transform active:scale-[0.99] active:bg-slate-50 ${
                bookWhen === 'later' ? 'border-slate-900' : 'border-slate-100'
              }`}
            >
              <CalendarDays className={`w-4 h-4 shrink-0 ${bookWhen === 'later' ? 'text-slate-900' : 'text-slate-400'}`} />
              <span className={`text-xs font-semibold ${bookWhen === 'later' ? 'text-slate-900' : 'text-slate-600'}`}>Later</span>
            </button>
          </div>

          {/* Date + Time — overlay trick: display div at 12px, real input invisible on top */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-normal text-slate-400 pl-1">Date</label>
              <div className="relative h-9 group">
                <div className="absolute inset-0 bg-white border border-slate-100 rounded-xl px-2.5 flex items-center justify-between pointer-events-none group-focus-within:border-slate-900 transition">
                  <span className={`text-xs font-semibold ${bookWhen === 'now' ? 'text-slate-300' : date ? 'text-slate-700' : 'text-slate-400'}`}>
                    {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                  </span>
                  <CalendarDays className={`w-3 h-3 shrink-0 ${bookWhen === 'now' ? 'text-slate-200' : 'text-slate-400'}`} />
                </div>
                {bookWhen === 'later' && (
                  <input type="date" required value={date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setDate(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ fontSize: '16px' }} />
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-normal text-slate-400 pl-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time
                {isNight && <span className="text-amber-500 font-semibold ml-1">+RM5</span>}
              </label>
              <div className="relative h-9 group">
                <div className={`absolute inset-0 border rounded-xl px-2.5 flex items-center justify-between pointer-events-none group-focus-within:border-slate-900 transition ${
                  isNight ? 'border-amber-200 bg-amber-50/50' : 'bg-white border-slate-100'
                }`}>
                  <span className={`text-xs font-semibold ${bookWhen === 'now' ? 'text-slate-300' : !time ? 'text-slate-400' : isNight ? 'text-amber-700' : 'text-slate-700'}`}>
                    {time || 'Select time'}
                  </span>
                  <Clock className={`w-3 h-3 shrink-0 ${bookWhen === 'now' ? 'text-slate-200' : 'text-slate-400'}`} />
                </div>
                {bookWhen === 'later' && (
                  <input type="time" required value={time}
                    onChange={e => setTime(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ fontSize: '16px' }} />
                )}
              </div>
            </div>
          </div>

          {/* Passengers stepper */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-normal text-slate-400 pl-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Number of Passengers
            </label>
            <div className="flex items-center gap-2">
              <button type="button" onPointerDown={e => { e.preventDefault(); setPassengers(p => Math.max(1, p - 1)); }}
                className="w-10 h-10 rounded-xl border border-slate-100 bg-white text-slate-700 font-semibold text-sm active:bg-slate-50 active:scale-95 transition-transform flex items-center justify-center shrink-0">−</button>
              <span className="flex-1 text-center font-black text-xs text-slate-800">{passengers}</span>
              <button type="button" onPointerDown={e => { e.preventDefault(); setPassengers(p => Math.min(8, p + 1)); }}
                className="w-10 h-10 rounded-xl border border-slate-100 bg-white text-slate-700 font-semibold text-sm active:bg-slate-50 active:scale-95 transition-transform flex items-center justify-center shrink-0">+</button>
            </div>
            {passengers > 4 && (
              <p className="text-xs text-amber-600 font-normal pl-1">Over 4 pax — extra charge may apply</p>
            )}
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-normal text-slate-400 pl-1 flex items-center gap-1">
              <Phone className="w-3 h-3" /> Contact Number
            </label>
            <input
              type="tel"
              required
              value={contact}
              onChange={e => setContact(e.target.value)}
              placeholder="e.g. 0123456789"
              className="w-full h-9 bg-white border border-slate-100 rounded-xl px-3 font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition"
              style={{ fontSize: '16px' }}
              autoComplete="tel"
            />
          </div>

          {/* Remark */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-normal text-slate-400 pl-1">
              Remark for Driver (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              maxLength={500}
              placeholder="e.g. luggage, wheelchair, main gate..."
              className="w-full h-9 bg-white border border-slate-100 rounded-xl px-3 font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition"
              style={{ fontSize: '16px' }}
              autoComplete="off"
              autoCorrect="off"
            />
          </div>
        </div>

        {/* Fare summary */}
        <div className="bg-white border border-slate-100 rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-normal block">Estimated Fare</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base font-black text-slate-800">
                {totalFare === 'TBC' ? 'TBC' : `RM${totalFare.toFixed(2)}`}
              </span>
              {isNight && baseFare !== 'TBC' && (
                <span className="text-xs font-normal text-amber-500">including midnight surcharge +RM5</span>
              )}
            </div>
          </div>
        </div>

        {bookingError && (
          <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-xs text-danger font-semibold text-center">
            {bookingError}
          </div>
        )}

        {/* Book button */}
        <button
          type="submit"
          disabled={!canBook || booking}
          className={`w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-2xl transition-all duration-300 active:scale-[0.99] ${
            canBook && !booking
              ? 'bg-primary hover:bg-primary-hover shadow-lg shadow-primary/30 cursor-pointer'
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
          <p className="text-xs text-slate-400 font-normal text-center -mt-1">
            {bookMode === 'quick' && !selectedRoute ? 'Select a route above to continue' : ''}
            {bookMode === 'map' && !(pickupPin && destPin) ? 'Drop both pins on the map to continue' : ''}
            {!(date && time) ? 'Fill in date and time to continue' : ''}
          </p>
        )}
      </form>

      {/* Booking Terms — Drawer Standard */}
      {showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowTerms(false)}
        >
          <div
            className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag pill */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">BOOKING TERMS</p>
              <button
                onClick={() => setShowTerms(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-90 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              <div className="px-5 flex flex-col gap-3" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
                <div className="border border-slate-100 rounded-2xl p-4 flex flex-col gap-3 text-xs text-slate-500 font-normal leading-relaxed">
                  <p>• Bookings between <strong className="text-slate-700">12am–7am</strong> must be placed <strong className="text-slate-700">before 10pm</strong>.</p>
                  <p>• Night ride (12am–7am) attracts an extra <strong className="text-amber-500">RM5 charge</strong> — applied automatically.</p>
                  <p>• Maximum <strong className="text-slate-700">4 passengers</strong> per trip. Exceeding this may incur extra charge.</p>
                  {campus === 'gambang' && <p>• Peak hours may also incur additional charges.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
