import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
interface PinLocation { address: string; coords: [number, number]; }

const MapboxRideMap = lazy(() => import('../components/MapboxRideMap').then(m => ({ default: m.MapboxRideMap })));
import {
  Map, List, PencilLine, Car, PlaneTakeoff,
  Info, CheckCircle2, RotateCcw, Users, Clock, CalendarDays, Phone, ClipboardList, X,
  ArrowUpDown, History,
} from 'lucide-react';

// Mirrors MapboxRideMap.tsx's own formatDuration — duplicated rather than
// imported so this static import doesn't defeat that component's lazy-load
// code-splitting (maplibre-gl is heavy and only needed in Search Routes mode).
const formatDriveDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
};
import { submitRideToSheets } from '../lib/sheetsService';
import { useTapVsScroll } from '../lib/useTapVsScroll';
import { NativeSelect } from '../components/NativeSelect';

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
  { from: 'UMP Pekan / Fakulti',    to: 'DHUAM',                        fare: 10,              emoji: '🏢' },
  { from: 'UMP Pekan / Fakulti',    to: 'Anywhere inside UMP',          fare: 5,               emoji: '🏫' },
  { from: 'UMP Pekan / Fakulti',    to: 'Kuantan',                      fare: 50,              emoji: '🏬' },
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
  { from: 'UMP Gambang',            to: "McDonald's Sg. Isap",             fare: 24,            emoji: '🍔' },
  { from: 'UMP Gambang',            to: 'Air Terjun Pandan',               fare: 27,            emoji: '💧' },
  { from: 'UMP Gambang',            to: 'ECM / KCM',                       fare: 32,            emoji: '🏬' },
  { from: 'UMP Gambang',            to: 'Pantai Kempadang',                fare: 34,            emoji: '🏖️' },
  { from: 'UMP Gambang',            to: 'IM (IIUM Kuantan)',               fare: 35,            emoji: '🏫' },
  { from: 'UMP Gambang',            to: 'Teluk Cempedak',                  fare: 35,            emoji: '🌊' },
  { from: 'UMP Gambang',            to: 'Pantai Sepat',                    fare: 42,            emoji: '🌊' },
  { from: 'UMP Gambang',            to: 'Pantai Balok',                    fare: 45,            emoji: '🌊' },
  { from: 'UMP Gambang',            to: 'Pekan',                           fare: 60,            emoji: '🏙️' },
  { from: 'CFS IIUM Gambang',       to: 'Bus Stop UMP',                    fare: 11,            emoji: '🚌' },
  { from: 'CFS IIUM Gambang',       to: 'Taman Tas',                       fare: 22,            emoji: '🌳' },
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

// ─── AerBus (Airport/Bus pickup & drop) ─────────────────────────────────────────
// Two-way transfers to/from a fixed set of points — bufferMin is both the
// campus↔point travel time and the dispatch-time buffer applied to whatever
// ticket time the customer enters (see aerbusDispatch below). Gambang is
// genuinely closer to the airport than Pekan is (that's why its Quick
// Routes fare was always cheaper), so it gets its own, shorter buffers —
// reusing Pekan's figures for it would be wrong, not just imprecise. No
// Pekan Bus Terminal option for Gambang — that route doesn't exist.
type AerbusPointId = 'airport' | 'tsk' | 'pekan_bus';
interface AerbusPoint { id: AerbusPointId; label: string; bufferMin: number; fare: number; }

const AERBUS_POINTS: Record<'pekan' | 'gambang', AerbusPoint[]> = {
  pekan: [
    { id: 'airport',   label: 'Airport (Sultan Ahmad Shah)', bufferMin: 60, fare: 40 },
    { id: 'tsk',       label: 'TSK',                          bufferMin: 60, fare: 45 },
    { id: 'pekan_bus', label: 'Pekan Bus Terminal',            bufferMin: 25, fare: 15 },
  ],
  gambang: [
    { id: 'airport', label: 'Airport (Sultan Ahmad Shah)', bufferMin: 30, fare: 18 },
    { id: 'tsk',     label: 'TSK',                          bufferMin: 40, fare: 28 },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Transport: React.FC = () => {
  const { user, setCurrentPage, showAuthGate, setLeaveGuard, isPreviewMode, guestCampus } = useApp();

  // Page state — campus is the logged-in user's own, EXCEPT while a
  // superadmin is in Customer Preview mode browsing as a chosen campus
  // (guestCampus, e.g. "UMPSA Pekan") — this previously always fell back
  // to the admin's own real campus, so previewing as Pekan still showed
  // Gambang's Quick Routes/AerBus points. No in-page switcher otherwise
  // (removed campus toggle, superadmin included).
  const effectiveCampusRaw = isPreviewMode && guestCampus ? guestCampus : user.campus;
  const campus: 'pekan' | 'gambang' = effectiveCampusRaw?.toLowerCase().includes('pekan') ? 'pekan' : 'gambang';
  const [bookMode, setBookMode] = useState<'quick' | 'custom' | 'map' | 'aerbus'>(user.isLoggedIn ? 'custom' : 'map');
  const [showTerms, setShowTerms] = useState(false);
  // Sub-page Standard (same in-place pattern as Profile.tsx's "My Profile"
  // sub-page) — Quick Routes no longer has its own tab; browsing every
  // preset route (grouped by pickup point) plus the full Recent Routes
  // list now lives here instead, reached by tapping the "Recent Routes"
  // label above Order Details.
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  // Which pickup-point category is expanded in the sub-page's Quick Routes
  // dropdown — same FROM-dropdown-then-list interaction the old inline
  // Quick Routes mode used, just relocated here.
  const [pickerFrom, setPickerFrom] = useState('');

  // Global back button (Header's own "<", plus hardware/gesture back) closes
  // this sub-page instead of leaving Transport entirely while it's open —
  // same leaveGuard mechanism Register.tsx uses for its Terms/Privacy
  // overlay. The sub-page's own back button is removed in favor of this.
  useEffect(() => {
    if (!showRoutePicker) { setLeaveGuard(null); return; }
    setLeaveGuard(() => () => setShowRoutePicker(false));
    return () => setLeaveGuard(null);
  }, [showRoutePicker, setLeaveGuard]);

  // Recent routes — the student's own past pickup/destination pairs,
  // deduplicated (most-recent occurrence wins) so a route booked 5 times
  // shows once, not five times. RLS on ride_orders already scopes this to
  // the logged-in customer's own rows (auth.uid() = customer_id), so no
  // customer_id needs to be passed from the client. Lets a returning
  // student skip typing a route they've already used before, with a swap
  // option for the return trip instead of needing a second, reversed entry.
  const [recentRoutes, setRecentRoutes] = useState<{ pickup: string; destination: string }[]>([]);
  useEffect(() => {
    if (!user.isLoggedIn) return;
    supabase
      .from('ride_orders')
      .select('pickup, destination')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Set<string>();
        const deduped: { pickup: string; destination: string }[] = [];
        for (const row of data) {
          const pickup = row.pickup?.trim();
          const destination = row.destination?.trim();
          if (!pickup || !destination) continue;
          const key = `${pickup.toLowerCase()}→${destination.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({ pickup, destination });
          if (deduped.length >= 3) break;
        }
        setRecentRoutes(deduped);
      });
  }, [user.isLoggedIn]);

  // Shared by the Recent Routes chip strip, the route picker sub-page
  // (both its Recent and Quick Routes sections), and the swap/return-trip
  // button — one place decides what picking any (pickup, destination)
  // pair actually does.
  const pickRoute = (pickup: string, destination: string) => {
    // A recent route may happen to match a fixed-fare Quick Route exactly
    // (e.g. its own reverse direction) — route into Quick mode with that
    // fare pre-selected instead of Custom mode, which always shows "TBC"
    // and would otherwise quietly downgrade an already-known price.
    const routeList = campus === 'pekan' ? PEKAN_ROUTES : GAMBANG_ROUTES;
    const match = routeList.find(
      r => r.from.toLowerCase() === pickup.toLowerCase() && r.to.toLowerCase() === destination.toLowerCase()
    );
    if (match) {
      setBookMode('quick');
      setSelectedRoute(match);
    } else {
      setBookMode('custom');
      setCustomPickup(pickup);
      setCustomDest(destination);
    }
    setShowRoutePicker(false);
  };

  // AerBus state. aerbusDirection now drives which side of the Custom-Route-
  // style card the airport point occupies (Point A vs Point B) instead of a
  // separate To/From toggle — the flip button just swaps this. The campus
  // side is free-text, defaulting to the customer's own campus; null means
  // "untouched" (fixed fare applies), any typed value means "edited"
  // (fare becomes TBC, same as Custom mode).
  const [aerbusDirection, setAerbusDirection] = useState<'to' | 'from'>('to');
  const [aerbusPoint,     setAerbusPoint]     = useState<AerbusPointId | ''>('');
  const [aerbusCampusOverride, setAerbusCampusOverride] = useState<string | null>(null);

  // Quick-route state — selectedRoute is still set (by pickRoute, via the
  // route picker sub-page) even though the old inline FROM-dropdown +
  // expandable list UI that used to set it directly is gone;
  // onRowPointerDown/onRowPointerUp is reused by the sub-page's route
  // rows, same tap-vs-scroll behavior as before.
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const { onPointerDown: onRowPointerDown, onPointerUp: onRowPointerUp } = useTapVsScroll();

  // Map-pin state
  const [pickupPin,    setPickupPin]    = useState<PinLocation | null>(null);
  const [destPin,      setDestPin]      = useState<PinLocation | null>(null);
  const [routeInfo,    setRouteInfo]    = useState<{ distanceKm: string; durationMin: number } | null>(null);

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

  // AerBus always books a specific ticket time — flights/buses aren't
  // something you catch "now" — so its date/time inputs are always
  // interactive regardless of the Now/Later toggle (hidden for this mode
  // anyway). Derived rather than forcing bookWhen itself, so switching back
  // to another mode restores whatever Now/Later choice the user actually
  // made instead of it staying stuck on 'later'.
  const effectiveBookWhen = bookMode === 'aerbus' ? 'later' : bookWhen;

  // Submission
  const [booking,          setBooking]          = useState(false);
  const [bookingDone,      setBookingDone]      = useState(false);
  const [bookingError,     setBookingError]     = useState<string | null>(null);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [editBlocked,      setEditBlocked]      = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────────

  const routes = campus === 'pekan' ? PEKAN_ROUTES : GAMBANG_ROUTES;
  const fromOptions = CAMPUS_FROM[campus];

  const aerbusPoints = AERBUS_POINTS[campus];
  const aerbusPointData = bookMode === 'aerbus'
    ? aerbusPoints.find(p => p.id === aerbusPoint) ?? null
    : null;

  // The customer types their ticket's boarding/landing time into the same
  // date+time fields every other mode uses — this derives the actual
  // dispatch time the driver acts on (ticket time minus the point's
  // buffer). Uses a real Date object rather than HH:MM subtraction so a
  // landing time close to midnight correctly rolls the dispatch date back
  // a day too, instead of silently landing on the wrong day.
  const aerbusDispatch = useMemo(() => {
    if (!aerbusPointData || !date || !time) return null;
    const dt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(dt.getTime())) return null;
    dt.setMinutes(dt.getMinutes() - aerbusPointData.bufferMin);
    return {
      date: dt.toISOString().slice(0, 10),
      time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
    };
  }, [aerbusPointData, date, time]);

  const isNight = useMemo(() => {
    const effectiveTime = aerbusDispatch?.time ?? time;
    if (!effectiveTime) return false;
    const [h] = effectiveTime.split(':').map(Number);
    return h >= 0 && h < 7;
  }, [time, aerbusDispatch]);

  // Editing the campus-side field away from the default drops the fare to
  // TBC, same rule as Custom mode — an edited value means it may no longer
  // actually be a straight campus↔point trip.
  const baseFare: number | 'TBC' = bookMode === 'quick'
    ? (selectedRoute?.fare ?? 0)
    : bookMode === 'aerbus'
    ? (aerbusCampusOverride !== null ? 'TBC' : (aerbusPointData?.fare ?? 'TBC'))
    : 'TBC';

  const nightCharge = isNight ? 5 : 0;

  const totalFare = baseFare === 'TBC'
    ? 'TBC'
    : baseFare + nightCharge;

  const campusLabelFull = campus === 'pekan' ? 'UMPSA Pekan Campus' : 'UMPSA Gambang Campus';
  const aerbusCampusLabel = aerbusCampusOverride ?? campusLabelFull;

  // The two AerBus card fields — same one regardless of which side
  // (pickup/destination) it currently occupies, since the flip button just
  // swaps aerbusDirection rather than the fields' own contents.
  const aerbusPointField = (
    <NativeSelect<AerbusPointId | ''>
      value={aerbusPoint}
      onChange={setAerbusPoint}
      placeholder="Select a point"
      options={aerbusPoints.map(p => ({ value: p.id, label: p.label, right: `RM${p.fare}` }))}
    />
  );
  const aerbusCampusField = (
    <input
      type="text"
      value={aerbusCampusLabel}
      onChange={e => setAerbusCampusOverride(e.target.value)}
      className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-900 transition"
    />
  );

  const pickupLabel = bookMode === 'quick'
    ? (selectedRoute ? selectedRoute.from : '')
    : bookMode === 'custom'
    ? customPickup
    : bookMode === 'aerbus'
    ? (aerbusPointData ? (aerbusDirection === 'to' ? aerbusCampusLabel : aerbusPointData.label) : '')
    : (pickupPin?.address ?? '');

  const destLabel = bookMode === 'quick'
    ? (selectedRoute ? selectedRoute.to : '')
    : bookMode === 'custom'
    ? customDest
    : bookMode === 'aerbus'
    ? (aerbusPointData ? (aerbusDirection === 'to' ? aerbusPointData.label : aerbusCampusLabel) : '')
    : (destPin?.address ?? '');

  const canBook =
    !!date && !!time && !!contact &&
    (bookMode === 'quick'  ? !!selectedRoute :
     bookMode === 'aerbus' ? !!aerbusPointData :
     bookMode === 'custom' ? !!(customPickup.trim() && customDest.trim()) :
     !!(pickupPin && destPin));

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBook = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!user.isLoggedIn) { showAuthGate(); return; }
    if (!canBook) return;
    setBooking(true);
    setEditBlocked(false);
    setBookingError(null);

    const campusLabel = campus === 'pekan' ? 'Pekan' : 'Gambang';
    // For AerBus, date/time (used everywhere else in the app — driver sort,
    // filters, receipts) hold the computed dispatch time, not the raw
    // ticket time the customer typed. aerbus_customer_time preserves that
    // raw value purely for display, so nothing is silently overwritten.
    const orderPayload = {
      customer_name: user.name || 'Student',
      campus:        campusLabel,
      date:          bookMode === 'aerbus' && aerbusDispatch ? aerbusDispatch.date : date,
      time:          bookMode === 'aerbus' && aerbusDispatch ? aerbusDispatch.time : time,
      pickup:        pickupLabel,
      destination:   destLabel,
      passengers,
      contact,
      fare:          baseFare === 'TBC' ? 'TBC' : String(baseFare),
      night_charge:  nightCharge,
      notes,
      book_mode:     bookMode,
      aerbus_direction:     bookMode === 'aerbus' ? aerbusDirection : null,
      aerbus_point:         bookMode === 'aerbus' ? aerbusPoint : null,
      aerbus_customer_time: bookMode === 'aerbus' ? time : null,
      // Only map-pin bookings have real, driver-navigable coordinates
      // (GPS for pickup, Google Places for destination) — everything else
      // (quick/custom/aerbus) is a named hub, not a geocoded point.
      pickup_lat:      bookMode === 'map' && pickupPin ? pickupPin.coords[1] : null,
      pickup_lng:      bookMode === 'map' && pickupPin ? pickupPin.coords[0] : null,
      destination_lat: bookMode === 'map' && destPin   ? destPin.coords[1]   : null,
      destination_lng: bookMode === 'map' && destPin   ? destPin.coords[0]   : null,
    };

    const { data: { user: authUser } } = await supabase.auth.getUser();
    // A stale/expired session here previously fell straight through to the
    // unconditional setBookingDone(true) below — the customer saw the full
    // "Booking Submitted!" success screen with no ride_orders row ever
    // written, insert or update. Bail out with a real error instead.
    if (!authUser) {
      setBooking(false);
      setBookingError('Your session has expired. Please log in again and try booking.');
      return;
    }

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
        // Logged (not shown to the user) so a schema/RLS-level failure —
        // e.g. a column the client sends that a pending migration hasn't
        // added yet — is diagnosable from devtools instead of looking
        // identical to a real network error.
        console.error('[GERAK] Ride booking insert failed:', error);
        setBooking(false);
        setBookingError('Your booking could not be saved. Please check your connection and try again.');
        return;
      }
      setSubmittedOrderId(data.id);

      // Log to Google Sheets for new bookings only
      await submitRideToSheets({
        campus: campus === 'pekan' ? 'UMPSA Pekan' : 'UMPSA Gambang',
        date: orderPayload.date, time: orderPayload.time,
        pickup: pickupLabel,
        destination: destLabel,
        passengers, contact,
        fare: baseFare,
        nightCharge, notes, bookMode,
      });
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

  // Auto-advance to My Orders a few seconds after a successful booking, so
  // the customer sees live status/driver info instead of this static
  // "Searching for your driver" screen. Cancelled if they navigate away
  // (bookingDone flips false) or tap Edit/New Booking first.
  useEffect(() => {
    if (!bookingDone) return;
    const timer = setTimeout(() => setCurrentPage('my-orders'), 3000);
    return () => clearTimeout(timer);
  }, [bookingDone, setCurrentPage]);

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

  // ── Route picker sub-page — Sub-page Standard (same in-place pattern as
  // Profile.tsx's "My Profile" sub-page): permanent header replaced by a
  // title, not an overlay, not a page navigation. No local back button
  // here — the global Header's own "<" (and hardware/gesture back) is
  // redirected to close this sub-page instead, via the leaveGuard effect
  // above. Lists the full Recent Routes history plus every preset Quick
  // Route (picked via a FROM dropdown, same interaction the old inline
  // Quick Routes mode used), merged into one screen since Quick Routes no
  // longer has its own tab. Picking any row calls the same pickRoute()
  // used by the Recent Routes chip strip, which also closes this sub-page.
  if (showRoutePicker) {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar animate-fade-in">
        <div className="px-5 pt-5 pb-2">
          <h1 className="text-xl font-bold text-slate-900 m-0">Select a Route</h1>
        </div>

        <div className="px-5 pt-2 flex flex-col gap-5" style={{ paddingBottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}>
          {recentRoutes.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-emerald-600 animate-blink pl-1 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Recent Routes
              </p>
              {recentRoutes.map(({ pickup, destination }) => (
                <button
                  key={`${pickup}→${destination}`}
                  type="button"
                  onPointerDown={onRowPointerDown}
                  onPointerUp={e => onRowPointerUp(e, () => pickRoute(pickup, destination))}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-2xl border border-slate-100 bg-white transition-transform active:scale-[0.99] active:bg-slate-50 text-left"
                >
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    {pickup} <span className="text-slate-300">→</span> {destination}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-400 pl-1 flex items-center gap-1.5">
              <List className="w-3.5 h-3.5" /> Quick Routes
            </p>
            <NativeSelect
              value={pickerFrom}
              onChange={setPickerFrom}
              options={fromOptions.map(from => ({ value: from, label: from }))}
              placeholder="Select pickup location…"
            />
            {pickerFrom && (
              <div className="flex flex-col gap-2 mt-1">
                {routes.filter(r => r.from === pickerFrom).map((route, i) => (
                  <button
                    key={i}
                    type="button"
                    onPointerDown={onRowPointerDown}
                    onPointerUp={e => onRowPointerUp(e, () => pickRoute(route.from, route.to))}
                    className="w-full flex items-center justify-between py-2.5 px-3 rounded-2xl border border-slate-100 bg-white transition-transform active:scale-[0.99] active:bg-slate-50 text-left"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800 leading-tight">{route.emoji} {route.to}</p>
                      {route.maxPax && (
                        <p className="text-xs text-amber-600 font-normal mt-0.5">Max {route.maxPax} pax</p>
                      )}
                    </div>
                    <span className="text-xs font-black text-slate-800 shrink-0 ml-2">RM{route.fare}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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

      <div className="px-4 pt-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 animate-blink"
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

      {/* Mode selector — 3 modes (Quick Routes folded into the route picker
          sub-page, reached via the "Recent Routes" label below) */}
      {user.isLoggedIn && (
        <div className="px-4 mt-3 flex gap-2">
          {([
            { key: 'custom', icon: PencilLine,   label: 'Custom'        },
            { key: 'map',    icon: Map,          label: 'Search Routes' },
            { key: 'aerbus', icon: PlaneTakeoff, label: 'AerBus'        },
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

      {/* Recent routes trigger — opens the full route picker sub-page
          (Recent Routes history + Quick Routes). Custom mode only — Recent
          Routes/Quick Routes are the fast-track alternative to typing in
          Custom, so they don't apply once you're already in Search Routes
          or AerBus. Sits right above the Custom Route card it's a
          shortcut for — Comfortable Card Gap Standard (mt-4, the "roomy"
          gap between major stacked sections) above it, a tight mt-2
          (label-to-its-content) below, before the Custom Route card. */}
      {user.isLoggedIn && bookMode === 'custom' && (
        <div className="px-4 mt-4">
          <button
            type="button"
            onClick={() => setShowRoutePicker(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 animate-blink"
          >
            <History className="w-3.5 h-3.5" /> Recent Routes
          </button>
        </div>
      )}

      {/* Selected route summary — shown when a route was picked via the
          route picker sub-page (tap "Recent Routes" above) and it matched
          a known fixed-fare Quick Route. No tab in the mode selector above
          highlights for this, since it isn't one of the 3 remaining modes
          — this card is the only on-screen confirmation of what's booked,
          replacing the old inline Quick Routes picker's own summary. */}
      {bookMode === 'quick' && selectedRoute && (
        <div className="px-4 mt-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <List className="w-4 h-4 text-slate-400" /> Quick Route
              </h3>
              {/* Swaps by re-running the same route lookup Recent Routes/the
                  picker sub-page already use — a known fixed-fare reverse
                  route shows its own fare, otherwise falls back to Custom
                  with fare TBC, same as picking any unmatched pair does. */}
              <button
                type="button"
                onClick={() => pickRoute(selectedRoute.to, selectedRoute.from)}
                title="Swap pickup and destination"
                aria-label="Swap pickup and destination"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 active:scale-90 active:bg-slate-100 transition shrink-0"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div onClick={() => setShowRoutePicker(true)} className="flex flex-col gap-2 cursor-pointer">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point A — Pickup</label>
                <div className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700">
                  {selectedRoute.from}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point B — Destination</label>
                <div className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700">
                  {selectedRoute.to}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-normal text-center italic">
              RM{selectedRoute.fare}{selectedRoute.maxPax ? ` · Max ${selectedRoute.maxPax} pax` : ''} · Tap route to change
            </p>
          </div>
        </div>
      )}

      {/* ── Custom Mode ── */}
      {bookMode === 'custom' && (
        <div className="px-4 mt-2">
          <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <PencilLine className="w-4 h-4 text-slate-400" /> Custom Route
              </h3>
              <button
                type="button"
                onClick={() => { setCustomPickup(customDest); setCustomDest(customPickup); }}
                title="Swap pickup and destination"
                aria-label="Swap pickup and destination"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 active:scale-90 active:bg-slate-100 transition shrink-0"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
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
        <div className="px-4 mt-4 flex flex-col gap-4">
          <Suspense fallback={<div className="flex justify-center py-12"><span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}>
            <MapboxRideMap
              campusCenter={CAMPUS_CENTERS[campus]}
              onPickupChange={(name, coords) => setPickupPin(name ? { address: name, coords: coords ?? [0, 0] } : null)}
              onDestinationChange={(name, coords) => setDestPin(name ? { address: name, coords: coords ?? [0, 0] } : null)}
              onRouteInfoChange={setRouteInfo}
            />
          </Suspense>
          <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Map className="w-4 h-4 text-slate-400" /> Search Route
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point A — Pickup</label>
                <div className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 truncate">
                  {pickupPin?.address || 'Detecting location…'}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point B — Destination</label>
                <div className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 truncate">
                  {destPin?.address || 'Search above'}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 py-1">
              <div className="flex flex-col items-center">
                <span className="text-base font-black text-slate-800">
                  {routeInfo ? `${routeInfo.distanceKm} km` : '—'}
                </span>
                <span className="text-xs font-normal text-slate-400">Distance</span>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex flex-col items-center">
                <span className="text-base font-black text-slate-800">
                  {routeInfo ? formatDriveDuration(routeInfo.durationMin) : '—'}
                </span>
                <span className="text-xs font-normal text-slate-400">Est. drive time</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-normal text-center italic">
              Fare for map bookings will be confirmed by your driver
            </p>
          </div>
        </div>
      )}

      {/* ── AerBus ── */}
      {bookMode === 'aerbus' && (
        <div className="px-4 mt-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <PlaneTakeoff className="w-4 h-4 text-slate-400" /> AerBus Route
              </h3>
              {/* Flip swaps which side (Point A/B) holds the airport point
                  — this IS the To/From direction now, no separate toggle. */}
              <button
                type="button"
                onClick={() => setAerbusDirection(d => d === 'to' ? 'from' : 'to')}
                title="Swap pickup and destination"
                aria-label="Swap pickup and destination"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 active:scale-90 active:bg-slate-100 transition shrink-0"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point A — Pickup</label>
                {aerbusDirection === 'to' ? aerbusCampusField : aerbusPointField}
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-normal text-slate-400 pl-1">Point B — Destination</label>
                {aerbusDirection === 'to' ? aerbusPointField : aerbusCampusField}
              </div>
            </div>
            {/* Always rendered (never conditional) so this card is the same
                height as Custom Route's, which always shows its own footer
                note too. */}
            <p className="text-xs text-slate-400 font-normal text-center italic">
              {aerbusCampusOverride !== null
                ? 'Fare will be confirmed by your driver'
                : aerbusPointData
                ? `Fixed fare — RM${aerbusPointData.fare}`
                : 'Select a point to see the fare'}
            </p>
          </div>
        </div>
      )}

      {/* ── Order form ── */}
      <form onSubmit={handleBook} className="px-4 mt-4 flex flex-col gap-2">
        <div className="bg-white border border-slate-100 rounded-2xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-slate-400" /> Order Details
            </h3>
            {/* Buffer-time flag — reflects whichever AerBus point is
                currently selected, so it updates the moment the dropdown
                selection changes. */}
            {bookMode === 'aerbus' && aerbusPointData && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                <PlaneTakeoff className="w-3 h-3" />
                +{aerbusPointData.bufferMin >= 60 ? `${aerbusPointData.bufferMin / 60}h` : `${aerbusPointData.bufferMin}min`} buffer
              </span>
            )}
          </div>

          {/* Now / Later toggle — Mode Selector Standard. AerBus always
              books a specific ticket time, so it skips this entirely. */}
          {bookMode !== 'aerbus' && (
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
          )}

          {/* Date + Time — overlay trick: display div at 12px, real input invisible on top */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-normal text-slate-400 pl-1">Date</label>
              <div className="relative h-9 group">
                <div className="absolute inset-0 bg-white border border-slate-100 rounded-xl px-2.5 flex items-center justify-between pointer-events-none group-focus-within:border-slate-900 transition">
                  <span className={`text-xs font-semibold ${effectiveBookWhen === 'now' ? 'text-slate-300' : date ? 'text-slate-700' : 'text-slate-400'}`}>
                    {date ? new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                  </span>
                  <CalendarDays className={`w-3 h-3 shrink-0 ${effectiveBookWhen === 'now' ? 'text-slate-200' : 'text-slate-400'}`} />
                </div>
                {effectiveBookWhen === 'later' && (
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
                <Clock className="w-3 h-3" />
                {bookMode === 'aerbus'
                  ? (aerbusDirection === 'to' ? 'Boarding Time' : 'Landing Time')
                  : 'Time'}
                {isNight && <span className="text-amber-500 font-semibold ml-1">+RM5</span>}
              </label>
              <div className="relative h-9 group">
                <div className={`absolute inset-0 border rounded-xl px-2.5 flex items-center justify-between pointer-events-none group-focus-within:border-slate-900 transition ${
                  isNight ? 'border-amber-200 bg-amber-50/50' : 'bg-white border-slate-100'
                }`}>
                  <span className={`text-xs font-semibold ${effectiveBookWhen === 'now' ? 'text-slate-300' : !time ? 'text-slate-400' : isNight ? 'text-amber-700' : 'text-slate-700'}`}>
                    {time || 'Select time'}
                  </span>
                  <Clock className={`w-3 h-3 shrink-0 ${effectiveBookWhen === 'now' ? 'text-slate-200' : 'text-slate-400'}`} />
                </div>
                {effectiveBookWhen === 'later' && (
                  <input type="time" required value={time}
                    onChange={e => setTime(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ fontSize: '16px' }} />
                )}
              </div>
            </div>
          </div>

          {/* AerBus buffer note — tells the customer to enter their actual
              ticket time as-is, since the buffer is already handled for them */}
          {bookMode === 'aerbus' && aerbusPointData && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-3.5 py-2.5 flex items-start gap-2">
              <PlaneTakeoff className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 font-normal leading-relaxed">
                Enter your actual {aerbusDirection === 'to' ? 'boarding/departure' : 'landing/arrival'} time —
                no need to add your own buffer. Your driver is automatically scheduled{' '}
                <strong>{aerbusPointData.bufferMin >= 60 ? `${aerbusPointData.bufferMin / 60} hour` : `${aerbusPointData.bufferMin} minutes`} earlier</strong>
                {aerbusDispatch && (
                  <> — {aerbusDirection === 'to' ? 'pickup' : 'driver departs'} at{' '}
                    <strong>{aerbusDispatch.time}</strong>
                    {aerbusDispatch.date !== date ? ` (${new Date(aerbusDispatch.date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })})` : ''}
                  </>
                )}.
              </p>
            </div>
          )}

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
            {bookMode === 'aerbus' && !aerbusPointData ? 'Select a pickup/drop point above to continue' : ''}
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
          onPointerDown={(e) => { e.preventDefault(); setShowTerms(false); }}
        >
          <div
            className="w-full max-w-[480px] max-h-[calc(100dvh-5rem)] bg-white rounded-t-3xl shadow-2xl animate-slide-up flex flex-col"
            onPointerDown={e => e.stopPropagation()}
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
