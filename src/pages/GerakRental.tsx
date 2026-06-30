import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  KeyRound, ChevronLeft, ChevronRight, Users, Clock,
  CalendarDays, Car, RefreshCw, CheckCircle2, Info,
  Hash,
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
  start_hour: number;
  duration: number;
  persons: number;
  total_price: number;
  status: string;
  notes: string;
  created_at: string;
  // enriched
  owner_name: string;
  owner_gerak_id: string;
  owner_phone: string;
  car_type: string;
  plate_no: string;
  color: string;
  price_hour: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const fmt12 = (h: number) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
const toDateStr = (d: Date) => d.toISOString().split('T')[0];
const today = () => toDateStr(new Date());

export const GerakRental: React.FC = () => {

  const [owners, setOwners]           = useState<RentalOwner[]>([]);
  const [selected, setSelected]       = useState<RentalOwner | null>(null);
  const [blocks, setBlocks]           = useState<RentalBlock[]>([]);
  const [existingBooks, setExisting]  = useState<RentalBooking[]>([]);
  const [myBookings, setMyBookings]   = useState<RentalBooking[]>([]);
  const [loading, setLoading]         = useState(true);
  const [bookLoading, setBookLoading] = useState(false);
  const [toast, setToast]             = useState('');
  const [view, setView]               = useState<'list' | 'book' | 'my-bookings'>('list');

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [pickedDate,  setPickedDate]  = useState('');
  const [startHour,   setStartHour]   = useState<number | null>(null);
  const [duration,    setDuration]    = useState(1);
  const [persons,     setPersons]     = useState(1);
  const [notes,       setNotes]       = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Load all rental owners + their vehicles
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
        };
      })
      .filter(Boolean) as RentalOwner[];

    setOwners(merged);
    setLoading(false);
  }, []);

  // Load blocks + existing bookings for selected owner + date
  const loadAvailability = useCallback(async (ownerId: string, month: { year: number; month: number }) => {
    const from = `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`;
    const last = new Date(month.year, month.month + 1, 0);
    const to   = toDateStr(last);

    const [{ data: b }, { data: bk }] = await Promise.all([
      supabase.from('rental_blocks').select('date, blocked_hours')
        .eq('owner_id', ownerId).gte('date', from).lte('date', to),
      supabase.from('rental_bookings').select('date, start_hour, duration, status')
        .eq('owner_id', ownerId).gte('date', from).lte('date', to)
        .in('status', ['pending', 'confirmed']),
    ]);
    setBlocks(b ?? []);
    setExisting((bk ?? []) as RentalBooking[]);
  }, []);

  // Load customer's own bookings, enriched with owner + vehicle details
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

  // ── Availability helpers ──────────────────────────────────────────────────

  const isDateFullyBlocked = (dateStr: string): boolean => {
    const b = blocks.find(b => b.date === dateStr);
    return !!b && b.blocked_hours.length === 0; // empty array = full day blocked
  };

  const bookedHoursOn = (dateStr: string): Set<number> => {
    const set = new Set<number>();
    existingBooks
      .filter(bk => bk.date === dateStr)
      .forEach(bk => {
        for (let h = bk.start_hour; h < bk.start_hour + bk.duration; h++) set.add(h);
      });
    return set;
  };

  const blockedHoursOn = (dateStr: string): Set<number> => {
    const b = blocks.find(b => b.date === dateStr);
    if (!b) return new Set();
    if (b.blocked_hours.length === 0) return new Set(HOURS); // full day
    return new Set(b.blocked_hours);
  };

  const isHourAvailable = (dateStr: string, hour: number): boolean => {
    if (blockedHoursOn(dateStr).has(hour)) return false;
    if (bookedHoursOn(dateStr).has(hour)) return false;
    return true;
  };

  const canBookSlot = (dateStr: string, start: number, dur: number): boolean => {
    for (let h = start; h < start + dur; h++) {
      if (!isHourAvailable(dateStr, h)) return false;
    }
    return true;
  };

  // ── Calendar helpers ──────────────────────────────────────────────────────

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

  // ── Submit booking ────────────────────────────────────────────────────────

  const handleBook = async () => {
    if (!selected || !pickedDate || startHour === null) return;
    if (!canBookSlot(pickedDate, startHour, duration)) {
      showToast('Selected slot is no longer available.'); return;
    }
    setBookLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const total = selected.price_hour * duration;
    const { error } = await supabase.from('rental_bookings').insert({
      owner_id: selected.id, customer_id: authUser?.id,
      date: pickedDate, start_hour: startHour, duration,
      persons, total_price: total, notes,
    });
    setBookLoading(false);
    if (error) { showToast('Booking failed. Please try again.'); return; }
    showToast('Booking sent! Awaiting owner confirmation.');
    setPickedDate(''); setStartHour(null); setDuration(1); setPersons(1); setNotes('');
    loadAvailability(selected.id, calMonth);
  };

  const totalPrice = selected ? selected.price_hour * duration : 0;
  const bookReady  = !!pickedDate && startHour !== null && canBookSlot(pickedDate, startHour, duration);

  // ── Status badge ─────────────────────────────────────────────────────────
  const statusStyle: Record<string, string> = {
    pending:   'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-red-50 text-red-500 border-red-200',
    completed: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <div className="flex-grow bg-slate-50 overflow-y-auto no-scrollbar pb-24 flex flex-col animate-fade-in">

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg text-center">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(selected || view === 'my-bookings') && (
            <button onClick={() => { setSelected(null); setPickedDate(''); setStartHour(null); setView('list'); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition active:scale-90">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-black text-slate-800 m-0 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-500" /> Gerak Rental
            </h2>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
              {selected ? selected.car_type || 'Book your slot' : 'Campus vehicle rental'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView('my-bookings'); loadMyBookings(); setSelected(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${view === 'my-bookings' ? 'bg-primary text-white' : 'bg-white border border-slate-100 text-slate-500'}`}>
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
              <p className="text-xs text-slate-400 font-semibold">No bookings yet.</p>
            </div>
          ) : myBookings.map(bk => (
            <div key={bk.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">

              {/* Receipt header */}
              <div className="bg-amber-500 px-5 pt-4 pb-3 flex items-start justify-between">
                <div>
                  <p className="text-[9px] font-extrabold text-amber-100 uppercase tracking-widest">Rental Receipt</p>
                  <p className="text-lg font-black text-white leading-tight mt-0.5">{bk.car_type}</p>
                  <p className="text-[10px] text-amber-100 font-semibold">{bk.plate_no} · {bk.color}</p>
                </div>
                <span className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full border uppercase ${statusStyle[bk.status] ?? statusStyle.pending}`}>
                  {bk.status}
                </span>
              </div>

              {/* Dashed separator */}
              <div className="mx-5 border-t border-dashed border-slate-200" />

              {/* Date & time block */}
              <div className="px-5 pt-4 pb-2 grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-slate-400 font-bold mb-0.5">Date</p>
                  <p className="text-[10px] font-extrabold text-slate-700 leading-tight">
                    {new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-slate-400 font-bold mb-0.5">Time</p>
                  <p className="text-[10px] font-extrabold text-slate-700 leading-tight">
                    {fmt12(bk.start_hour)}<br /><span className="text-[9px] text-slate-400">→ {fmt12(bk.start_hour + bk.duration)}</span>
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[9px] text-slate-400 font-bold mb-0.5">Duration</p>
                  <p className="text-[10px] font-extrabold text-slate-700 leading-tight">{bk.duration} hour{bk.duration > 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="px-5 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-semibold">Rate</span>
                  <span className="font-bold text-slate-600">RM{bk.price_hour.toFixed(2)} / hour</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-semibold">Duration</span>
                  <span className="font-bold text-slate-600">{bk.duration} hour{bk.duration > 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-semibold">Persons</span>
                  <span className="font-bold text-slate-600">{bk.persons} pax</span>
                </div>
                <div className="mt-1 pt-2 border-t border-dashed border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700">Total</span>
                  <span className="text-base font-black text-amber-500">RM{Number(bk.total_price).toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              {bk.notes && (
                <div className="mx-5 mb-3 bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-slate-400 font-bold mb-0.5">Note</p>
                  <p className="text-[10px] text-slate-500 italic">"{bk.notes}"</p>
                </div>
              )}

              {/* Dashed separator */}
              <div className="mx-5 border-t border-dashed border-slate-200" />

              {/* Owner + actions */}
              <div className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Vehicle Owner</p>
                  <p className="text-xs font-extrabold text-slate-800 truncate">{bk.owner_name}</p>
                  <p className="text-[10px] text-slate-400 font-semibold">{bk.owner_gerak_id}</p>
                </div>
                {bk.owner_phone && (
                  <a
                    href={`https://wa.me/${toWa(bk.owner_phone)}`}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-extrabold px-3 py-2 rounded-xl transition active:scale-95 shrink-0"
                  >
                    <WaIcon className="w-3 h-3" /> WhatsApp
                  </a>
                )}
              </div>

              {/* Booking ref footer */}
              <div className="bg-slate-50 px-5 py-2 flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-slate-300" />
                <p className="text-[9px] text-slate-400 font-mono font-bold tracking-wider">
                  {String(bk.booking_no).padStart(5, '0')}
                </p>
                <span className="ml-auto text-[9px] text-slate-300 font-semibold">
                  {new Date(bk.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── OWNER LIST VIEW ── */}
      {view === 'list' && !selected && (
        <div className="px-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin" />
            </div>
          ) : owners.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center flex flex-col items-center gap-3">
              <KeyRound className="w-8 h-8 text-slate-200" />
              <p className="text-xs text-slate-400 font-semibold">No vehicles available for rental yet.</p>
            </div>
          ) : owners.map(o => (
            <div key={o.id} onClick={() => { setSelected(o); setView('book'); }}
              className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm cursor-pointer hover:shadow-md active:scale-[0.99] transition flex flex-col gap-3">
              {/* Vehicle info */}
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                  <Car className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-extrabold text-slate-800 m-0 truncate">{o.car_type || 'Vehicle'}</h4>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{o.plate_no} · {o.color}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-amber-500">RM{o.price_hour.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400 font-bold">per hour</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-[9px] text-slate-400 font-bold">Seats</p>
                  <p className="text-xs font-extrabold text-slate-700">{o.seats} pax</p>
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-[9px] text-slate-400 font-bold">Campus</p>
                  <p className="text-xs font-extrabold text-slate-700">{o.campus}</p>
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-[9px] text-slate-400 font-bold">Owner</p>
                  <p className="text-xs font-extrabold text-slate-700 truncate">{o.name.split(' ')[0]}</p>
                </div>
              </div>

              {o.description && (
                <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">{o.description}</p>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                <p className="text-[10px] text-slate-400 font-bold">ID: {o.gerak_id}</p>
                <span className="text-[10px] text-amber-500 font-extrabold">Tap to book →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── BOOKING VIEW ── */}
      {view === 'book' && selected && (
        <div className="px-4 flex flex-col gap-4">

          {/* Owner vehicle card */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Car className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-800 truncate">{selected.car_type}</p>
              <p className="text-[10px] text-slate-500 font-semibold">{selected.plate_no} · {selected.color} · {selected.seats} seats</p>
            </div>
            <p className="text-sm font-black text-amber-600 shrink-0">RM{selected.price_hour.toFixed(2)}/h</p>
          </div>

          {/* Calendar */}
          <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-xs font-extrabold text-slate-700">{monthLabel()}</p>
              <button onClick={nextMonth} className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 mb-1">
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className="text-center text-[9px] font-extrabold text-slate-400">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-0.5">
              {calDays().map((dateStr, i) => {
                if (!dateStr) return <div key={i} />;
                const isPast    = dateStr < today();
                const isBlocked = isDateFullyBlocked(dateStr);
                const isPicked  = dateStr === pickedDate;
                return (
                  <button key={dateStr} disabled={isPast || isBlocked}
                    onClick={() => { setPickedDate(dateStr); setStartHour(null); }}
                    className={`aspect-square rounded-xl text-[10px] font-bold transition active:scale-90 ${
                      isPicked   ? 'bg-primary text-white font-extrabold' :
                      isBlocked  ? 'bg-red-50 text-red-300 cursor-not-allowed' :
                      isPast     ? 'text-slate-200 cursor-not-allowed' :
                                   'text-slate-700 hover:bg-amber-50'
                    }`}>
                    {parseInt(dateStr.split('-')[2])}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-3 text-[9px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Blocked</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" /> Selected</span>
            </div>
          </div>

          {/* Hour slots */}
          {pickedDate && (
            <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm">
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-3">
                Available Hours — {pickedDate}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {HOURS.map(h => {
                  const avail   = isHourAvailable(pickedDate, h);
                  const picked  = startHour === h;
                  const inSlot  = startHour !== null && h > startHour && h < startHour + duration;
                  return (
                    <button key={h} disabled={!avail}
                      onClick={() => setStartHour(h)}
                      className={`py-2 rounded-xl text-[10px] font-bold transition active:scale-95 ${
                        picked   ? 'bg-primary text-white' :
                        inSlot   ? 'bg-primary/20 text-primary' :
                        !avail   ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                                   'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                      }`}>
                      {fmt12(h)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Duration + Persons + Notes */}
          {pickedDate && startHour !== null && (
            <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm flex flex-col gap-4">

              {/* Duration */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Duration
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    {fmt12(startHour)} → {fmt12(startHour + duration)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setDuration(d => Math.max(1, d - 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">−</button>
                  <span className="text-sm font-black text-slate-800 w-6 text-center">{duration}h</span>
                  <button onClick={() => setDuration(d => Math.min(8, d + 1))}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-lg flex items-center justify-center active:scale-90">+</button>
                </div>
              </div>

              {/* Persons */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
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
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any notes for the owner? (optional)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-amber-400 transition resize-none"
              />

              {/* Total + Book */}
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-amber-600 font-bold">Total</p>
                  <p className="text-xl font-black text-slate-800">RM{totalPrice.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400 font-semibold">{duration}h × RM{selected.price_hour.toFixed(2)}</p>
                </div>
                <button
                  onClick={handleBook}
                  disabled={!bookReady || bookLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs px-5 py-3 rounded-2xl transition active:scale-95 disabled:opacity-40 flex items-center gap-2"
                >
                  {bookLoading
                    ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : <><CheckCircle2 className="w-4 h-4" /> Book Now</>}
                </button>
              </div>
            </div>
          )}

          {/* Owner contact info */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex gap-3 items-start">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-extrabold text-slate-700">Owner — {selected.name}</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                {selected.gerak_id} · {selected.phone}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
