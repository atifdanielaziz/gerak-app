import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import {
  KeyRound, ChevronLeft, ChevronRight, Users, Clock,
  CalendarDays, Car, RefreshCw, CheckCircle2, Info,
  Moon, Upload, FileText, XCircle, ExternalLink,
} from 'lucide-react';
import { WaBtn } from '../lib/whatsapp';
import { fmt12, fmtDuration, toDateStr, todayStr as today } from '../lib/format';
import { ReceiptHeader, ReceiptCard } from '../components/Receipt';
import { buildRentalReceiptRows } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';

interface RentalOwner {
  id: string;
  name: string;
  phone: string;
  gerak_id: string;
  campus: string;
  car_type: string;
  plate_no: string;
  color: string;
  seats: number;
  price_hour: number;
  description: string;
  operating_start: number;
  operating_end: number;
  night_surcharge_on: boolean;
  night_surcharge_rate: number;
}

interface RentalBlock {
  date: string;
  blocked_hours: number[];
}

interface RentalBooking {
  id: string;
  booking_no: number;
  owner_id: string;
  date: string;
  end_date: string | null;
  booking_type: string;
  start_hour: number;
  duration: number;
  persons: number;
  total_price: number;
  status: string;
  notes: string;
  license_url: string;
  created_at: string;
  owner_name: string;
  owner_gerak_id: string;
  owner_phone: string;
  car_type: string;
  plate_no: string;
  color: string;
  price_hour: number;
}

const ALLOWED_LICENSE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const HOURS = Array.from({ length: 48 }, (_, i) => i * 0.5);

const getDatesInRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (cur <= endD) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

export const GerakRental: React.FC = () => {
  const { user, showAuthGate, setLeaveGuard } = useApp();

  const [owners, setOwners]           = useState<RentalOwner[]>([]);
  const [selected, setSelected]       = useState<RentalOwner | null>(null);
  const [blocks, setBlocks]           = useState<RentalBlock[]>([]);
  const [existingBooks, setExisting]  = useState<RentalBooking[]>([]);
  const [myBookings, setMyBookings]   = useState<RentalBooking[]>([]);
  const [loading, setLoading]         = useState(true);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);
  const [toast, setToast]             = useState('');
  const [view, setView]               = useState<'list' | 'book' | 'my-bookings'>('list');

  // Registers with AppContext's goBack() so leaving the booking form or My
  // Bookings (header back chevron, hardware back, or the edge-swipe
  // gesture — all three call the same shared goBack()) returns to the car
  // list first, instead of skipping past it straight out of the page.
  useEffect(() => {
    if (view === 'list') { setLeaveGuard(null); return; }
    setLeaveGuard(() => () => { setView('list'); setSelected(null); });
    return () => setLeaveGuard(null);
  }, [view, setLeaveGuard]);

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [bookingType,  setBookingType]  = useState<'hourly' | 'fullday'>('hourly');
  const [rangeStart,   setRangeStart]   = useState('');
  const [rangeEnd,     setRangeEnd]     = useState('');
  const [startHour,    setStartHour]    = useState<number | null>(null);
  const [duration,     setDuration]     = useState(1);
  const [persons,      setPersons]      = useState(1);
  const [notes,        setNotes]        = useState('');

  // License upload for My Bookings
  const [uploadingLicense, setUploadingLicense] = useState<string | null>(null);
  const licenseRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ── Load owners ────────────────────────────────────────────────────────────
  const loadOwners = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, phone, gerak_id, campus')
      .eq('can_rent', true);

    if (!profiles?.length) { setOwners([]); setLoading(false); return; }

    const ids = profiles.map(p => p.id);
    const { data: vehicles } = await supabase
      .from('rental_vehicles')
      .select('*')
      .in('owner_id', ids);

    const vehicleByOwner = new Map(vehicles?.map(v => [v.owner_id, v]) ?? []);
    const merged: RentalOwner[] = profiles
      .map(p => {
        const v = vehicleByOwner.get(p.id);
        if (!v) return null;
        return {
          id: p.id, name: p.name, phone: p.phone ?? '', gerak_id: p.gerak_id ?? '',
          campus: p.campus ?? '',
          car_type: v.car_type, plate_no: v.plate_no, color: v.color,
          seats: v.seats, price_hour: Number(v.price_hour), description: v.description,
          operating_start:      Number(v.operating_start      ?? 8),
          operating_end:        Number(v.operating_end        ?? 22),
          night_surcharge_on:   Boolean(v.night_surcharge_on  ?? false),
          night_surcharge_rate: Number(v.night_surcharge_rate ?? 0),
        };
      })
      .filter(Boolean) as RentalOwner[];

    setOwners(merged);
    setLoading(false);
  }, []);

  // ── Load availability for selected owner ───────────────────────────────────
  const loadAvailability = useCallback(async (ownerId: string, month: { year: number; month: number }) => {
    const from = `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`;
    const last = new Date(month.year, month.month + 1, 0);
    const to   = toDateStr(last);

    const [{ data: b }, { data: bk }] = await Promise.all([
      supabase.from('rental_blocks').select('date, blocked_hours')
        .eq('owner_id', ownerId).gte('date', from).lte('date', to),
      supabase.from('rental_bookings')
        .select('id, date, end_date, booking_type, start_hour, duration, status')
        .eq('owner_id', ownerId)
        .lte('date', to)
        .in('status', ['pending', 'confirmed']),
    ]);

    setBlocks(b ?? []);
    setExisting((bk ?? []).map(r => ({
      ...r,
      start_hour: Number(r.start_hour),
      duration:   Number(r.duration),
    })) as RentalBooking[]);
  }, []);

  // ── Load customer's own bookings ───────────────────────────────────────────
  const loadMyBookings = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: rows } = await supabase
      .from('rental_bookings')
      .select('*')
      .eq('customer_id', authUser.id)
      .order('date', { ascending: false })
      .limit(20);
    if (!rows?.length) { setMyBookings([]); return; }

    const ownerIds = [...new Set(rows.map(r => r.owner_id))];
    const [{ data: profiles }, { data: vehicles }] = await Promise.all([
      supabase.from('profiles').select('id, name, gerak_id, phone').in('id', ownerIds),
      supabase.from('rental_vehicles').select('owner_id, car_type, plate_no, color, price_hour').in('owner_id', ownerIds),
    ]);

    const profileById    = new Map(profiles?.map(p => [p.id, p]) ?? []);
    const vehicleByOwner = new Map(vehicles?.map(v => [v.owner_id, v]) ?? []);
    const enriched: RentalBooking[] = rows.map(r => {
      const p = profileById.get(r.owner_id);
      const v = vehicleByOwner.get(r.owner_id);
      return {
        ...r,
        start_hour:     Number(r.start_hour),
        duration:       Number(r.duration),
        license_url:    r.license_url    ?? '',
        end_date:       r.end_date       ?? null,
        booking_type:   r.booking_type   ?? 'hourly',
        owner_name:     p?.name      ?? '—',
        owner_gerak_id: p?.gerak_id  ?? '—',
        owner_phone:    p?.phone     ?? '',
        car_type:       v?.car_type  ?? '—',
        plate_no:       v?.plate_no  ?? '—',
        color:          v?.color     ?? '—',
        price_hour:     Number(v?.price_hour ?? 0),
      };
    });
    setMyBookings(enriched);
  }, []);

  useEffect(() => {
    queueMicrotask(() => loadOwners());
  }, [loadOwners]);

  useEffect(() => {
    if (selected) {
      queueMicrotask(() => loadAvailability(selected.id, calMonth));
    }
  }, [selected, calMonth, loadAvailability]);

  // ── Availability helpers ───────────────────────────────────────────────────

  const isDateCoveredByFullDay = (dateStr: string): boolean =>
    existingBooks.some(bk => {
      if (bk.booking_type !== 'fullday') return false;
      const endD = bk.end_date ?? bk.date;
      return dateStr >= bk.date && dateStr <= endD;
    });

  const isDateFullyBlocked = (dateStr: string): boolean => {
    const b = blocks.find(b => b.date === dateStr);
    if (b && b.blocked_hours.length === 0) return true;
    return isDateCoveredByFullDay(dateStr);
  };

  // Booking slots inclusive of end time; next available = end + 0.5 (30-min gap)
  const bookedHoursOn = (dateStr: string): Set<number> => {
    const set = new Set<number>();
    existingBooks
      .filter(bk => bk.date === dateStr && bk.booking_type !== 'fullday')
      .forEach(bk => {
        const end = bk.start_hour + bk.duration;
        for (let h = bk.start_hour; h <= end; h += 0.5) set.add(h);
      });
    return set;
  };

  const blockedHoursOn = (dateStr: string): Set<number> => {
    const b = blocks.find(b => b.date === dateStr);
    if (!b) return new Set();
    if (b.blocked_hours.length === 0) return new Set(HOURS);
    return new Set(b.blocked_hours);
  };

  const isHourAvailable = (dateStr: string, hour: number): boolean => {
    if (blockedHoursOn(dateStr).has(hour)) return false;
    if (bookedHoursOn(dateStr).has(hour)) return false;
    return true;
  };

  const canBookSlot = (dateStr: string, start: number, dur: number): boolean => {
    const end = start + dur;
    // Neither this nor isHourAvailable ever checked the vehicle's own
    // operating hours — only blocked/booked slots. An hour past closing
    // isn't in either of those sets, so it read as "available" by default,
    // letting a booking silently run past the owner's declared closing time.
    if (selected && (start < selected.operating_start || end > selected.operating_end)) return false;
    for (let h = start; h <= end; h += 0.5) {
      if (!isHourAvailable(dateStr, h)) return false;
    }
    return true;
  };

  // ── Night surcharge ────────────────────────────────────────────────────────
  const calcNightSurcharge = (start: number, dur: number, owner: RentalOwner): number => {
    if (!owner.night_surcharge_on || owner.night_surcharge_rate <= 0) return 0;
    let nightHalfSlots = 0;
    for (let i = 0; i < dur; i += 0.5) {
      const h = (start + i) % 24;
      if (h >= 22 || h < 5) nightHalfSlots++;
    }
    return (nightHalfSlots * 0.5) * owner.night_surcharge_rate;
  };

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const calDays = (): (string | null)[] => {
    const { year, month } = calMonth;
    const first = new Date(year, month, 1).getDay();
    const days  = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  };

  const monthLabel = () => {
    const { year, month } = calMonth;
    return new Date(year, month, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
  };

  const prevMonth = () => setCalMonth(m => {
    const d = new Date(m.year, m.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setCalMonth(m => {
    const d = new Date(m.year, m.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // ── Date range / tap handler ───────────────────────────────────────────────
  const handleDateTap = (dateStr: string) => {
    setBookingDone(false);
    if (bookingType === 'hourly') {
      setRangeStart(dateStr);
      setRangeEnd(dateStr);
      setStartHour(null);
      setDuration(1);
    } else {
      if (!rangeStart || rangeEnd) {
        setRangeStart(dateStr);
        setRangeEnd('');
      } else if (dateStr < rangeStart) {
        setRangeStart(dateStr);
        setRangeEnd('');
      } else {
        const blocked = getDatesInRange(rangeStart, dateStr).some(d => isDateFullyBlocked(d) || d < today());
        if (blocked) { showToast('Some dates in this range are unavailable.'); return; }
        setRangeEnd(dateStr);
      }
    }
  };

  const switchBookingType = (t: 'hourly' | 'fullday') => {
    setBookingType(t);
    setRangeStart('');
    setRangeEnd('');
    setStartHour(null);
    setDuration(1);
    setBookingDone(false);
  };

  // ── Price calculation ──────────────────────────────────────────────────────
  const numDays = rangeStart && rangeEnd
    ? getDatesInRange(rangeStart, rangeEnd).length
    : (rangeStart ? 1 : 0);

  const nightSurcharge = bookingType === 'hourly' && startHour !== null && selected
    ? calcNightSurcharge(startHour, duration, selected)
    : 0;

  const totalHours = bookingType === 'hourly'
    ? duration
    : numDays * ((selected?.operating_end ?? 22) - (selected?.operating_start ?? 8));

  const totalPrice = selected ? selected.price_hour * totalHours + nightSurcharge : 0;

  const bookReady = bookingType === 'hourly'
    ? !!rangeStart && startHour !== null && canBookSlot(rangeStart, startHour, duration)
    : !!rangeStart && !!rangeEnd && numDays > 0;

  // ── Submit booking ─────────────────────────────────────────────────────────
  const handleBook = async () => {
    if (!user.isLoggedIn) { showAuthGate(); return; }
    if (!selected || !rangeStart) return;
    if (bookingType === 'hourly' && (startHour === null || !canBookSlot(rangeStart, startHour, duration))) {
      showToast('Selected slot is no longer available.'); return;
    }
    setBookLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const bookStart = bookingType === 'hourly' ? startHour! : selected.operating_start;
    const { error } = await supabase.from('rental_bookings').insert({
      owner_id:     selected.id,
      customer_id:  authUser?.id,
      date:         rangeStart,
      end_date:     rangeEnd || rangeStart,
      booking_type: bookingType,
      start_hour:   bookStart,
      duration:     totalHours,
      persons,
      total_price:  totalPrice,
      notes,
      license_url:  '',
    });
    setBookLoading(false);
    if (error) { showToast('Booking failed. Please try again.'); return; }
    setBookingDone(true);
    loadAvailability(selected.id, calMonth);
    loadMyBookings();
  };

  // ── License upload ─────────────────────────────────────────────────────────
  const handleLicenseUpload = async (bookingId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) { showToast('File too large. Max 10MB.'); return; }
    if (!ALLOWED_LICENSE_TYPES.includes(file.type)) { showToast('Only images or PDF files are allowed.'); return; }
    setUploadingLicense(bookingId);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${bookingId}/license.${ext}`;
    const { error: upErr } = await supabase.storage.from('rental-licenses').upload(path, file, { upsert: true });
    if (upErr) { showToast('Upload failed. Please try again.'); setUploadingLicense(null); return; }
    const { data: signed } = await supabase.storage.from('rental-licenses').createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? '';
    await supabase.from('rental_bookings').update({ license_url: url }).eq('id', bookingId);
    setUploadingLicense(null);
    loadMyBookings();
    showToast('License uploaded!');
  };

  // ── Cancel booking ─────────────────────────────────────────────────────────
  const handleCancelBooking = async (bookingId: string) => {
    await supabase.from('rental_bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    loadMyBookings();
    showToast('Booking cancelled.');
  };

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 flex flex-col animate-fade-in">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg text-center">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 m-0 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-400" /> Gerak Rental
            </h2>
            <p className="text-xs text-slate-400 font-normal mt-0.5">
              {selected ? selected.car_type || 'Book your slot' : 'Campus vehicle rental'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onPointerDown={(e) => { e.preventDefault(); setView('my-bookings'); loadMyBookings(); setSelected(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-transform ${view === 'my-bookings' ? 'bg-primary text-white' : 'bg-white border border-slate-100 text-slate-500'}`}>
            My Bookings
          </button>
          {!selected && view === 'list' && (
            <button onClick={loadOwners} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90">
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── MY BOOKINGS VIEW ── */}
      {view === 'my-bookings' && (
        <div className="px-4 flex flex-col gap-4">
          {myBookings.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center">
              <CalendarDays className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-normal">No bookings yet.</p>
            </div>
          ) : myBookings.map(bk => {
            const doc = buildRentalReceiptRows({ ...bk, renterName: user.name, renterPhone: user.phone });
            return (
            <div key={bk.id} className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">

              <ReceiptHeader meta={doc} />

              <ReceiptCard
                doc={doc}
                onSavePdf={(bk.status === 'confirmed' || bk.status === 'completed') ? () => generateReceiptPdf(doc) : undefined}
              >
                {/* License upload — pending only */}
                {bk.status === 'pending' && (
                  <>
                    <div className="border-t border-dashed border-slate-200 my-1" />
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      ref={el => { licenseRefs.current[bk.id] = el; }}
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleLicenseUpload(bk.id, file);
                        if (e.target) e.target.value = '';
                      }}
                    />
                    {bk.license_url ? (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2.5 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                          <p className="text-xs font-semibold text-emerald-700">License Uploaded ✓</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={bk.license_url} target="_blank" rel="noreferrer"
                            className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                          <button onClick={() => licenseRefs.current[bk.id]?.click()}
                            className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition">
                            Replace
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => licenseRefs.current[bk.id]?.click()}
                        disabled={uploadingLicense === bk.id}
                        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-100 text-slate-700 text-xs font-semibold py-2.5 rounded-2xl active:scale-95 transition disabled:opacity-50"
                      >
                        {uploadingLicense === bk.id
                          ? <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />}
                        {uploadingLicense === bk.id ? 'Uploading…' : 'Upload Driver\'s License'}
                      </button>
                    )}
                    <button
                      onClick={() => handleCancelBooking(bk.id)}
                      className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-xl active:scale-95 transition"
                    >
                      <XCircle className="w-3 h-3" /> Cancel Booking
                    </button>
                  </>
                )}
                {bk.status === 'confirmed' && bk.license_url && (
                  <>
                    <div className="border-t border-dashed border-slate-200 my-1" />
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2.5 gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                        <p className="text-xs font-semibold text-emerald-700">License Uploaded ✓</p>
                      </div>
                      <a href={bk.license_url} target="_blank" rel="noreferrer"
                        className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    </div>
                  </>
                )}
              </ReceiptCard>
            </div>
            );
          })}
        </div>
      )}

      {/* ── OWNER LIST VIEW ── */}
      {view === 'list' && !selected && (
        <div className="px-4 flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
            </div>
          ) : owners.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center flex flex-col items-center gap-3">
              <KeyRound className="w-8 h-8 text-slate-200" />
              <p className="text-xs text-slate-400 font-normal">No vehicles available for rental yet.</p>
            </div>
          ) : owners.map(o => (
            <div key={o.id} onClick={() => { setSelected(o); setView('book'); }}
              className="bg-white border border-slate-100 rounded-3xl p-5 cursor-pointer active:scale-[0.99] transition flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                  <Car className="w-6 h-6 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-slate-800 m-0 truncate">{o.car_type || 'Vehicle'}</h4>
                  <p className="text-xs text-slate-400 font-normal mt-0.5">{o.plate_no} · {o.color}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-800">RM{o.price_hour.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-normal">per hour</p>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 border border-slate-100 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-slate-400 font-normal">Seats</p>
                  <p className="text-xs font-semibold text-slate-700">{o.seats} pax</p>
                </div>
                <div className="flex-1 border border-slate-100 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-slate-400 font-normal">Campus</p>
                  <p className="text-xs font-semibold text-slate-700">{o.campus}</p>
                </div>
                <div className="flex-1 border border-slate-100 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-slate-400 font-normal">Hours</p>
                  <p className="text-xs font-semibold text-slate-700">{fmt12(o.operating_start)}–{fmt12(o.operating_end)}</p>
                </div>
              </div>

              {o.night_surcharge_on && (
                <div className="flex items-center gap-1.5 bg-indigo-50 rounded-xl px-3 py-1.5">
                  <Moon className="w-3 h-3 text-indigo-400" />
                  <p className="text-xs font-normal text-indigo-600">Night surcharge +RM{o.night_surcharge_rate.toFixed(2)}/h (10PM–5AM)</p>
                </div>
              )}

              {o.description && (
                <p className="text-xs text-slate-400 font-normal leading-relaxed">{o.description}</p>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <p className="text-xs text-slate-400 font-normal">ID: {o.gerak_id}</p>
                <span className="text-xs text-primary font-semibold">Tap to book →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BOOKING VIEW ── */}
      {view === 'book' && selected && (
        <div className="px-4 flex flex-col gap-4">

          {/* Vehicle summary */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{selected.car_type}</p>
              <p className="text-xs text-slate-500 font-normal">{selected.plate_no} · {selected.color} · {selected.seats} seats</p>
            </div>
            <p className="text-sm font-black text-slate-800 shrink-0">RM{selected.price_hour.toFixed(2)}/h</p>
          </div>

          {/* Booking type toggle — Mode Selector Standard */}
          <div className="flex gap-2">
            <button onPointerDown={(e) => { e.preventDefault(); switchBookingType('hourly'); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border bg-white text-xs font-semibold transition-transform active:scale-[0.99] active:bg-slate-50 ${
                bookingType === 'hourly' ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-400'
              }`}>
              <Clock className="w-3.5 h-3.5" /> Hourly
            </button>
            <button onPointerDown={(e) => { e.preventDefault(); switchBookingType('fullday'); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border bg-white text-xs font-semibold transition-transform active:scale-[0.99] active:bg-slate-50 ${
                bookingType === 'fullday' ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-400'
              }`}>
              <CalendarDays className="w-3.5 h-3.5" /> Full Day / Multi-Day
            </button>
          </div>

          {/* Booking type info */}
          {bookingType === 'fullday' && (
            <div className="border border-slate-100 rounded-2xl px-4 py-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 font-normal leading-relaxed">
                Full-day pickup: <strong>{fmt12(selected.operating_start)}</strong> · Return: <strong>{fmt12(selected.operating_end)}</strong>.
                Tap a start date, then an end date to select a range.
              </p>
            </div>
          )}

          {/* Calendar */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <button onPointerDown={(e) => { e.preventDefault(); prevMonth(); }} className="w-7 h-7 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-xs font-semibold text-slate-700">{monthLabel()}</p>
              <button onPointerDown={(e) => { e.preventDefault(); nextMonth(); }} className="w-7 h-7 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 active:scale-90">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="text-center text-xs font-normal text-slate-400">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calDays().map((dateStr, i) => {
                if (!dateStr) return <div key={i} />;
                const isPast      = dateStr < today();
                const isBlocked   = isDateFullyBlocked(dateStr);
                const isStart     = dateStr === rangeStart;
                const isEnd       = dateStr === rangeEnd;
                const isInRange   = rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd;
                const isSelected  = isStart || isEnd;
                return (
                  <button key={dateStr}
                    disabled={isPast || isBlocked}
                    onPointerDown={(e) => { if (isPast || isBlocked) return; e.preventDefault(); handleDateTap(dateStr); }}
                    className={`aspect-square text-xs font-normal transition active:scale-90 ${
                      isSelected  ? 'bg-primary text-white font-semibold rounded-xl' :
                      isInRange   ? 'bg-primary/15 text-primary rounded-sm' :
                      isBlocked   ? 'bg-red-50 text-red-300 cursor-not-allowed rounded-xl' :
                      isPast      ? 'text-slate-200 cursor-not-allowed rounded-xl' :
                                    'text-slate-700 hover:bg-slate-100 rounded-xl'
                    }`}>
                    {parseInt(dateStr.split('-')[2])}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-3 text-xs font-normal text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Blocked</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" /> Selected</span>
              {bookingType === 'fullday' && rangeStart && !rangeEnd && (
                <span className="text-primary font-semibold">Now tap end date</span>
              )}
            </div>
          </div>

          {/* Hourly: time slot picker */}
          {bookingType === 'hourly' && rangeStart && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5">
              <p className="text-sm font-semibold text-slate-700 mb-1">
                Available Hours — {rangeStart}
              </p>
              <p className="text-xs text-slate-400 font-normal mb-3">
                Grey = booked or buffered (30-min gap between bookings)
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {HOURS.filter(h => h >= selected.operating_start && h <= selected.operating_end - 0.5).map(h => {
                  const avail   = isHourAvailable(rangeStart, h);
                  const picked  = startHour === h;
                  const inSlot  = startHour !== null && h > startHour && h <= startHour + duration;
                  const isNight = h >= 22 || h < 5;
                  return (
                    <button key={h} disabled={!avail}
                      onPointerDown={(e) => { if (!avail) return; e.preventDefault(); setStartHour(h); }}
                      className={`py-2 rounded-xl text-xs font-semibold transition-transform active:scale-95 relative ${
                        picked   ? 'bg-primary text-white' :
                        !avail   ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                        inSlot   ? 'bg-primary/20 text-primary' :
                        isNight  ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' :
                                   'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}>
                      {fmt12(h)}
                      {isNight && avail && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-indigo-400 rounded-full" />}
                    </button>
                  );
                })}
              </div>
              {selected.night_surcharge_on && (
                <p className="text-xs text-indigo-500 font-normal mt-2 flex items-center gap-1">
                  <Moon className="w-3 h-3" /> Purple = night hours (+RM{selected.night_surcharge_rate.toFixed(2)}/h surcharge)
                </p>
              )}
            </div>
          )}

          {/* Duration + Persons + Notes (hourly) */}
          {bookingType === 'hourly' && rangeStart && startHour !== null && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              {/* Duration */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> Duration
                  </p>
                  <p className="text-xs text-slate-400 font-normal mt-0.5">
                    {fmt12(startHour)} → {fmt12(+(startHour + duration).toFixed(1))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onPointerDown={e => { e.preventDefault(); setDuration(d => Math.max(1, d - 1)); }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center transition-transform active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-10 text-center">{fmtDuration(duration)}</span>
                  <button onPointerDown={e => {
                      e.preventDefault();
                      const ceiling = selected ? selected.operating_end - startHour : 12;
                      setDuration(d => Math.min(12, ceiling, d + 1));
                    }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center transition-transform active:scale-90">+</button>
                </div>
              </div>

              {/* Night surcharge breakdown */}
              {nightSurcharge > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-indigo-600">Night Surcharge</p>
                    <p className="text-xs text-indigo-700 font-normal">
                      +RM{nightSurcharge.toFixed(2)} for night hours in this slot
                    </p>
                  </div>
                </div>
              )}

              {/* Persons */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> Persons
                </p>
                <div className="flex items-center gap-3">
                  <button onPointerDown={e => { e.preventDefault(); setPersons(p => Math.max(1, p - 1)); }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center transition-transform active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-6 text-center">{persons}</span>
                  <button onPointerDown={e => { e.preventDefault(); setPersons(p => Math.min(selected.seats, p + 1)); }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center transition-transform active:scale-90">+</button>
                </div>
              </div>

              {/* Notes */}
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any notes for the owner? (optional)"
                className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900 transition resize-none" />

              {/* Profile auto-fill display — logged in only */}
              {user.isLoggedIn && (
                <div className="border border-slate-100 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                  <p className="text-xs font-normal text-slate-400">Booking as</p>
                  <p className="text-xs font-semibold text-slate-700">{user.name}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.phone}</p>
                </div>
              )}

              {/* Total + Book */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-normal">Total</p>
                  <p className="text-xl font-black text-slate-800">RM{totalPrice.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-normal">
                    {fmtDuration(duration)} × RM{selected.price_hour.toFixed(2)}{nightSurcharge > 0 ? ` + RM${nightSurcharge.toFixed(2)} night` : ''}
                  </p>
                </div>
                {!user.isLoggedIn ? (
                  <button onClick={() => showAuthGate()}
                    className="bg-primary hover:bg-primary-hover text-white font-semibold text-xs px-5 py-3 rounded-2xl transition-transform active:scale-95 shadow-lg shadow-primary/30 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Book
                  </button>
                ) : bookingDone ? (
                  <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-4 py-3 rounded-2xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" /> Booked
                  </span>
                ) : (
                  <button onClick={handleBook} disabled={!bookReady || bookLoading}
                    className="bg-primary hover:bg-primary-hover text-white font-semibold text-xs px-5 py-3 rounded-2xl transition-transform active:scale-95 disabled:opacity-40 shadow-lg shadow-primary/30 flex items-center gap-2">
                    {bookLoading
                      ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      : <><CheckCircle2 className="w-4 h-4" /> Book Now</>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Full-day: persons + notes + total */}
          {bookingType === 'fullday' && rangeStart && rangeEnd && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              {/* Full-day summary */}
              <div className="border border-slate-100 rounded-xl px-4 py-3 flex flex-col gap-1">
                <p className="text-xs font-normal text-slate-400">Booking Summary</p>
                <p className="text-xs font-semibold text-slate-700">
                  {rangeStart === rangeEnd
                    ? new Date(rangeStart + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
                    : `${new Date(rangeStart + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })} – ${new Date(rangeEnd + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                </p>
                <p className="text-xs text-slate-500 font-normal">
                  {numDays} day{numDays > 1 ? 's' : ''} · Pickup {fmt12(selected.operating_start)} → Return {fmt12(selected.operating_end)} · {totalHours}h total
                </p>
              </div>

              {/* Persons */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> Persons
                </p>
                <div className="flex items-center gap-3">
                  <button onPointerDown={e => { e.preventDefault(); setPersons(p => Math.max(1, p - 1)); }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center transition-transform active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-6 text-center">{persons}</span>
                  <button onPointerDown={e => { e.preventDefault(); setPersons(p => Math.min(selected.seats, p + 1)); }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center transition-transform active:scale-90">+</button>
                </div>
              </div>

              {/* Notes */}
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any notes for the owner? (optional)"
                className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-slate-900 transition resize-none" />

              {/* Profile auto-fill display — logged in only */}
              {user.isLoggedIn && (
                <div className="border border-slate-100 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                  <p className="text-xs font-normal text-slate-400">Booking as</p>
                  <p className="text-xs font-semibold text-slate-700">{user.name}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.phone}</p>
                </div>
              )}

              {/* Total + Book */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-normal">Total</p>
                  <p className="text-xl font-black text-slate-800">RM{totalPrice.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-normal">
                    {numDays}d ×{selected.operating_end - selected.operating_start}h × RM{selected.price_hour.toFixed(2)}
                  </p>
                </div>
                {!user.isLoggedIn ? (
                  <button onClick={() => showAuthGate()}
                    className="bg-primary hover:bg-primary-hover text-white font-semibold text-xs px-5 py-3 rounded-2xl transition-transform active:scale-95 shadow-lg shadow-primary/30 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Book
                  </button>
                ) : bookingDone ? (
                  <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-4 py-3 rounded-2xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" /> Booked
                  </span>
                ) : (
                  <button onClick={handleBook} disabled={!bookReady || bookLoading}
                    className="bg-primary hover:bg-primary-hover text-white font-semibold text-xs px-5 py-3 rounded-2xl transition-transform active:scale-95 disabled:opacity-40 shadow-lg shadow-primary/30 flex items-center gap-2">
                    {bookLoading
                      ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      : <><CheckCircle2 className="w-4 h-4" /> Book Now</>}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Owner contact info — logged in only */}
          {user.isLoggedIn && (
            <div className="border border-slate-100 rounded-2xl p-5 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">Owner — {selected.name}</p>
                  <p className="text-xs text-slate-400 font-normal mt-0.5">
                    {selected.gerak_id} · {selected.phone}
                  </p>
                </div>
              </div>
              {selected.phone && (
                <WaBtn phone={selected.phone} iconClass="w-5 h-5" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
