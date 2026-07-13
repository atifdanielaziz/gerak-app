import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import {
  KeyRound, ChevronLeft, ChevronRight, Users, Clock,
  CalendarDays, Car, RefreshCw, CheckCircle2, Info,
  Hash, Moon, Upload, FileText, XCircle, ExternalLink, FileDown,
} from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';

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
const fmt12 = (h: number) => {
  const total = ((h % 24) + 24) % 24;
  const hh  = Math.floor(total);
  const mm  = total % 1 !== 0 ? ':30' : ':00';
  const p   = hh < 12 ? 'AM' : 'PM';
  const dh  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${dh}${mm} ${p}`;
};
const fmtDuration = (h: number | string) => {
  const n = Number(h);
  return n < 1 ? '30 min' : Number.isInteger(n) ? `${n}h` : `${Math.floor(n)}h 30m`;
};
const toDateStr = (d: Date) => d.toISOString().split('T')[0];
const today = () => toDateStr(new Date());

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

const statusStyle: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-500 border-red-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-100',
};

export const GerakRental: React.FC = () => {
  const { user, showAuthGate } = useApp();

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

    const merged: RentalOwner[] = profiles
      .map(p => {
        const v = vehicles?.find(v => v.owner_id === p.id);
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

    const enriched: RentalBooking[] = rows.map(r => {
      const p = profiles?.find(p => p.id === r.owner_id);
      const v = vehicles?.find(v => v.owner_id === r.owner_id);
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

  useEffect(() => { loadOwners(); }, [loadOwners]);

  useEffect(() => {
    if (selected) loadAvailability(selected.id, calMonth);
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtDateRange = (bk: RentalBooking) => {
    if (bk.booking_type === 'fullday' && bk.end_date && bk.end_date !== bk.date) {
      const s = new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short' });
      const e = new Date(bk.end_date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${s} – ${e}`;
    }
    return new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const generatePdf = (bk: RentalBooking) => {
    const isFullDay = bk.booking_type === 'fullday';
    const days = isFullDay && bk.end_date ? getDatesInRange(bk.date, bk.end_date).length : null;
    const ref = `#${String(bk.booking_no ?? '').padStart(5, '0')}`;
    const bookingDate = new Date(bk.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    const printDate  = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });

    const row = (label: string, value: string) =>
      `<div class="row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Gerak Rental Receipt ${ref}</title>
<style>
body{font-family:monospace;font-size:13px;color:#1e293b;max-width:400px;margin:40px auto;padding:0 20px}
h1{font-size:20px;font-weight:300;margin:0 0 2px}h1 span{color:#ef4444}
.sub{font-size:11px;color:#94a3b8;margin-bottom:24px}
.row{display:flex;justify-content:space-between;margin-bottom:6px;gap:8px}
.lbl{color:#94a3b8;flex-shrink:0}.val{font-weight:700;text-align:right}
hr{border:none;border-top:1px dashed #cbd5e1;margin:12px 0}
.total{font-size:16px}
.ref{font-size:10px;color:#94a3b8;text-align:center;margin-top:24px}
@media print{body{margin:20px auto}}
</style></head><body>
<h1>ger<span>a</span>k</h1>
<div class="sub">Gerak Rental — Booking Receipt</div>
${row('Booking Ref', ref)}
${row('Status', bk.status.toUpperCase())}
<hr/>
${row('Vehicle', bk.car_type)}
${row('Plate No.', bk.plate_no)}
${row('Colour', bk.color)}
<hr/>
${isFullDay
  ? row('Date Range', fmtDateRange(bk)) + row('Duration', `${days} day${days === 1 ? '' : 's'}`)
  : row('Date', fmtDateRange(bk)) + row('Time', `${fmt12(bk.start_hour)} → ${fmt12(bk.start_hour + bk.duration)}`) + row('Duration', fmtDuration(bk.duration))
}
${row('Persons', `${bk.persons} pax`)}
<hr/>
${isFullDay
  ? row('Rate', `RM${Number(bk.total_price).toFixed(2)} / ${days} day${days === 1 ? '' : 's'}`)
  : row('Rate', `RM${bk.price_hour.toFixed(2)} / hour`) + row('Duration', fmtDuration(bk.duration))
}
${bk.notes ? row('Note', `"${bk.notes}"`) : ''}
<div class="row total"><span class="lbl">Total</span><span class="val">RM${Number(bk.total_price).toFixed(2)}</span></div>
<hr/>
${row('Renter', user.name ?? '—')}
${row('Phone', user.phone ?? '—')}
<hr/>
${row('Vehicle Owner', bk.owner_name)}
${row('Owner ID', bk.owner_gerak_id ?? '—')}
<div class="ref">Generated by Gerak · ${printDate} · ${bookingDate} booked</div>
</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;opacity:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (doc) {
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => { iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }, 300);
    }
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
              <KeyRound className="w-5 h-5 text-amber-500" /> Gerak Rental
            </h2>
            <p className="text-xs text-slate-400 font-normal mt-0.5">
              {selected ? selected.car_type || 'Book your slot' : 'Campus vehicle rental'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView('my-bookings'); loadMyBookings(); setSelected(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${view === 'my-bookings' ? 'bg-primary text-white' : 'bg-white border border-slate-100 text-slate-500'}`}>
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
          ) : myBookings.map(bk => (
            <div key={bk.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden">

              {/* Receipt header */}
              <div className="bg-amber-500 px-5 pt-4 pb-3 flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-100 uppercase tracking-widest">Gerak Rental Receipt</p>
                  <p className="text-lg font-black text-white leading-tight mt-0.5">{bk.car_type}</p>
                  <p className="text-xs text-amber-100 font-normal">{bk.plate_no} · {bk.color}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border uppercase ${statusStyle[bk.status] ?? statusStyle.pending}`}>
                  {bk.status}
                </span>
              </div>

              <div className="mx-5 border-t border-dashed border-slate-100" />

              {/* Date & time block */}
              <div className="px-5 pt-4 pb-2 grid grid-cols-3 gap-2">
                <div className="border border-slate-100 rounded-2xl px-3 py-2.5 text-center col-span-2">
                  <p className="text-xs text-slate-400 font-normal mb-0.5">
                    {bk.booking_type === 'fullday' ? 'Date Range' : 'Date'}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 leading-tight">{fmtDateRange(bk)}</p>
                </div>
                <div className="border border-slate-100 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-xs text-slate-400 font-normal mb-0.5">
                    {bk.booking_type === 'fullday' ? 'Days' : 'Duration'}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 leading-tight">
                    {bk.booking_type === 'fullday' && bk.end_date
                      ? `${getDatesInRange(bk.date, bk.end_date).length}d`
                      : fmtDuration(bk.duration)}
                  </p>
                </div>
              </div>

              {/* Hourly time slot */}
              {bk.booking_type !== 'fullday' && (
                <div className="px-5 pb-2">
                  <div className="border border-slate-100 rounded-2xl px-3 py-2.5 text-center">
                    <p className="text-xs text-slate-400 font-normal mb-0.5">Time</p>
                    <p className="text-xs font-semibold text-slate-700">
                      {fmt12(bk.start_hour)} → {fmt12(bk.start_hour + bk.duration)}
                    </p>
                  </div>
                </div>
              )}

              {/* Price breakdown */}
              <div className="px-5 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-normal">Rate</span>
                  <span className="font-semibold text-slate-600">RM{bk.price_hour.toFixed(2)} / hour</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-normal">Duration</span>
                  <span className="font-semibold text-slate-600">{fmtDuration(bk.duration)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-normal">Persons</span>
                  <span className="font-semibold text-slate-600">{bk.persons} pax</span>
                </div>
                <div className="mt-1 pt-2 border-t border-dashed border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Total</span>
                  <span className="text-base font-black text-amber-500">RM{Number(bk.total_price).toFixed(2)}</span>
                </div>
              </div>

              {/* License upload section */}
              <div className="px-5 pb-3">
                {bk.status === 'pending' && (
                  <>
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
                        className="w-full flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold py-2.5 rounded-2xl active:scale-95 transition disabled:opacity-50"
                      >
                        {uploadingLicense === bk.id
                          ? <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />}
                        {uploadingLicense === bk.id ? 'Uploading…' : 'Upload Driver\'s License'}
                      </button>
                    )}
                  </>
                )}
                {bk.status === 'confirmed' && bk.license_url && (
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
                )}
              </div>

              {/* Notes */}
              {bk.notes && (
                <div className="mx-5 mb-3 border border-slate-100 rounded-xl px-3 py-2">
                  <p className="text-xs text-slate-400 font-normal mb-0.5">Note</p>
                  <p className="text-xs text-slate-500 italic">"{bk.notes}"</p>
                </div>
              )}

              <div className="mx-5 border-t border-dashed border-slate-100" />

              {/* Booked By → Vehicle Owner stacked, WA icon at owner name level */}
              <div className="px-5 py-3 flex flex-col gap-4">
                <div>
                  <p className="text-xs text-slate-400 font-normal mb-0.5">Booked By</p>
                  <p className="text-xs font-semibold text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.phone}</p>
                  {bk.status === 'pending' && (
                    <button
                      onClick={() => handleCancelBooking(bk.id)}
                      className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl active:scale-95 transition"
                    >
                      <XCircle className="w-3 h-3" /> Cancel Booking
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-normal mb-0.5">Vehicle Owner</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{bk.owner_name}</p>
                      <p className="text-xs text-slate-400 font-normal">{bk.owner_gerak_id}</p>
                    </div>
                    {bk.owner_phone && (
                      <a
                        href={`https://wa.me/${toWa(bk.owner_phone)}?text=${encodeURIComponent(`Hi, I have a rental booking with you. Booking #${String(bk.booking_no ?? '').padStart(5, '0')}`)}`}
                        target="_blank" rel="noreferrer"
                        className="w-8 h-8 flex items-center justify-center bg-emerald-500 text-white rounded-xl active:scale-90 transition shrink-0"
                      >
                        <WaIcon className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* PDF button — only when confirmed or completed */}
              {(bk.status === 'confirmed' || bk.status === 'completed') && (
                <div className="px-5 pb-3">
                  <button
                    onClick={() => generatePdf(bk)}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-slate-100 text-slate-500 text-xs font-semibold py-2.5 rounded-2xl active:scale-95 transition hover:bg-slate-50"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Save as PDF
                  </button>
                </div>
              )}

              {/* Booking ref footer */}
              <div className="border-t border-slate-100 px-5 py-2 flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-slate-300" />
                <p className="text-xs text-slate-400 font-mono font-normal">
                  {String(bk.booking_no ?? '').padStart(5, '0')}
                </p>
                <span className="ml-auto text-xs text-slate-300 font-normal">
                  {new Date(bk.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── OWNER LIST VIEW ── */}
      {view === 'list' && !selected && (
        <div className="px-4 flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin" />
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
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                  <Car className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-slate-800 m-0 truncate">{o.car_type || 'Vehicle'}</h4>
                  <p className="text-xs text-slate-400 font-normal mt-0.5">{o.plate_no} · {o.color}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-amber-500">RM{o.price_hour.toFixed(2)}</p>
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
                <span className="text-xs text-amber-500 font-semibold">Tap to book →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BOOKING VIEW ── */}
      {view === 'book' && selected && (
        <div className="px-4 flex flex-col gap-4">

          {/* Vehicle summary */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{selected.car_type}</p>
              <p className="text-xs text-slate-500 font-normal">{selected.plate_no} · {selected.color} · {selected.seats} seats</p>
            </div>
            <p className="text-sm font-black text-amber-600 shrink-0">RM{selected.price_hour.toFixed(2)}/h</p>
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
                                    'text-slate-700 hover:bg-amber-50 rounded-xl'
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
                <span className="text-amber-500 font-semibold">Now tap end date</span>
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
                                   'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
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
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Duration
                  </p>
                  <p className="text-xs text-slate-400 font-normal mt-0.5">
                    {fmt12(startHour)} → {fmt12(+(startHour + duration).toFixed(1))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDuration(d => Math.max(1, d - 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-10 text-center">{fmtDuration(duration)}</span>
                  <button onClick={() => setDuration(d => Math.min(12, d + 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">+</button>
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
                  <Users className="w-3.5 h-3.5 text-amber-500" /> Persons
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPersons(p => Math.max(1, p - 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-6 text-center">{persons}</span>
                  <button onClick={() => setPersons(p => Math.min(selected.seats, p + 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">+</button>
                </div>
              </div>

              {/* Notes */}
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any notes for the owner? (optional)"
                className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-amber-400 transition resize-none" />

              {/* Profile auto-fill display — logged in only */}
              {user.isLoggedIn && (
                <div className="border border-slate-100 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                  <p className="text-xs font-normal text-slate-400">Booking as</p>
                  <p className="text-xs font-semibold text-slate-700">{user.name}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.phone}</p>
                </div>
              )}

              {/* Total + Book */}
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-normal">Total</p>
                  <p className="text-xl font-black text-slate-800">RM{totalPrice.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-normal">
                    {fmtDuration(duration)} × RM{selected.price_hour.toFixed(2)}{nightSurcharge > 0 ? ` + RM${nightSurcharge.toFixed(2)} night` : ''}
                  </p>
                </div>
                {!user.isLoggedIn ? (
                  <button onClick={() => showAuthGate()}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-5 py-3 rounded-2xl transition active:scale-95 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Book
                  </button>
                ) : bookingDone ? (
                  <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-4 py-3 rounded-2xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" /> Booked
                  </span>
                ) : (
                  <button onClick={handleBook} disabled={!bookReady || bookLoading}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-5 py-3 rounded-2xl transition active:scale-95 disabled:opacity-40 flex items-center gap-2">
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
                  <Users className="w-3.5 h-3.5 text-amber-500" /> Persons
                </p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPersons(p => Math.max(1, p - 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-6 text-center">{persons}</span>
                  <button onClick={() => setPersons(p => Math.min(selected.seats, p + 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">+</button>
                </div>
              </div>

              {/* Notes */}
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any notes for the owner? (optional)"
                className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-amber-400 transition resize-none" />

              {/* Profile auto-fill display — logged in only */}
              {user.isLoggedIn && (
                <div className="border border-slate-100 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
                  <p className="text-xs font-normal text-slate-400">Booking as</p>
                  <p className="text-xs font-semibold text-slate-700">{user.name}</p>
                  <p className="text-xs text-slate-400 font-normal">{user.phone}</p>
                </div>
              )}

              {/* Total + Book */}
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-normal">Total</p>
                  <p className="text-xl font-black text-slate-800">RM{totalPrice.toFixed(2)}</p>
                  <p className="text-xs text-slate-400 font-normal">
                    {numDays}d ×{selected.operating_end - selected.operating_start}h × RM{selected.price_hour.toFixed(2)}
                  </p>
                </div>
                {!user.isLoggedIn ? (
                  <button onClick={() => showAuthGate()}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-5 py-3 rounded-2xl transition active:scale-95 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Book
                  </button>
                ) : bookingDone ? (
                  <span className="bg-slate-100 text-slate-500 text-xs font-semibold px-4 py-3 rounded-2xl flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" /> Booked
                  </span>
                ) : (
                  <button onClick={handleBook} disabled={!bookReady || bookLoading}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs px-5 py-3 rounded-2xl transition active:scale-95 disabled:opacity-40 flex items-center gap-2">
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
                <a href={`https://wa.me/${toWa(selected.phone)}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition active:scale-95 shrink-0">
                  <WaIcon className="w-3 h-3" /> WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
