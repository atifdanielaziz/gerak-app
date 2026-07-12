import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  Car, MapPin, Navigation, Users, Clock,
  CheckCircle2, RefreshCw, Briefcase,
  ListOrdered, XCircle, ShieldOff, KeyRound,
  ChevronLeft, ChevronRight, Settings, CalendarDays,
  Package, Ban, Unlock, Hash, X, TrendingUp,
  Upload, FileImage, ShieldCheck, ShieldAlert,
  DollarSign, Moon, FileText, ExternalLink, FileDown,
} from 'lucide-react';
import { WaIcon, toWa } from '../lib/whatsapp';
import { OrderReceiptSheet } from '../components/OrderReceiptSheet';
import { MonthDrumPicker, EarningsCard, computeEarnings } from '../components/EarningsCard';

interface RentalVehicle {
  owner_id: string;
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

interface RentalBookingOwner {
  id: string;
  booking_no: number;
  customer_name: string;
  customer_phone: string;
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
  // admin-view enrichment
  owner_name?: string;
  owner_phone_display?: string;
  vehicle_label?: string;
}

interface RentalBlock {
  date: string;
  blocked_hours: number[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
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
const todayStr  = () => toDateStr(new Date());

interface RideOrder {
  id: string;
  customer_name: string;
  campus: string;
  date: string;
  time: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: string;
  night_charge: number;
  notes: string;
  status: string;
  driver_id: string | null;
  driver_name: string | null;
  created_at: string;
  accepted_at: string | null;
}

type DriverTab = 'pool' | 'my-jobs' | 'rental' | 'earnings';

const HISTORY_STATUS: Record<string, { label: string; cls: string }> = {
  accepted:    { label: 'Accepted',    cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  in_progress: { label: 'In Progress', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  completed:   { label: 'Completed',   cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};

export const DriverHome: React.FC = () => {
  const { user, activeRole, refreshUserData, receiptGateActive, setSheetOpen } = useApp();
  // Admin/superadmin who switched the pill to Driver should behave as a full driver
  const effectiveCanDrive = user.canDrive || activeRole === 'driver';

  const isAdminForRental = user.role === 'admin' || user.role === 'superadmin';
  const effectiveCanRent = user.canRent || isAdminForRental;
  const [activeTab, setActiveTab]           = useState<DriverTab>(!effectiveCanDrive && effectiveCanRent ? 'rental' : 'pool');
  const [pendingOrders, setPendingOrders]   = useState<RideOrder[]>([]);
  const [myJob, setMyJob]                   = useState<RideOrder | null>(null);
  const [myHistory, setMyHistory]           = useState<RideOrder[]>([]);
  const [accepting, setAccepting]           = useState<string | null>(null);
  const [updating, setUpdating]             = useState(false);
  const [cancelSecsLeft, setCancelSecsLeft] = useState<number>(0);
  const [toast, setToast]                   = useState('');
  const [uploadingDoc, setUploadingDoc]     = useState<'ic' | 'license' | null>(null);
  const icDocRef                            = useRef<HTMLInputElement>(null);
  const licenseDocRef                       = useRef<HTMLInputElement>(null);
  const [loading, setLoading]               = useState(true);
  const [newPing, setNewPing]               = useState(false);
  const prevPoolCount                       = useRef(0);

  // ── Rental state ──────────────────────────────────────────────────────────
  const [rentalVehicle,   setRentalVehicle]   = useState<RentalVehicle | null>(null);
  const [rentalBookings,  setRentalBookings]  = useState<RentalBookingOwner[]>([]);
  const [rentalBlocks,    setRentalBlocks]    = useState<RentalBlock[]>([]);
  const [rentalLoading,   setRentalLoading]   = useState(false);
  const [rentalSubView,   setRentalSubView]   = useState<'orders' | 'schedule' | 'vehicle' | 'pricing'>('orders');
  const [rentalMonth, setRentalMonth]         = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [scheduleDate,    setScheduleDate]    = useState('');
  const [vehicleForm,          setVehicleForm]          = useState<Partial<RentalVehicle>>({});
  const [vehicleSaving,        setVehicleSaving]        = useState(false);
  const [pendingRentals,       setPendingRentals]       = useState(0);
  const [rentalReceiptBk,      setRentalReceiptBk]      = useState<RentalBookingOwner | null>(null);
  const [earningsMonth, setEarningsMonth]               = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sheetOrder, setSheetOrder]                     = useState<RideOrder | null>(null);

  // Report to AppContext whenever a sheet here is open, so BottomNav hides itself.
  useEffect(() => {
    const anyOpen = !!sheetOrder || !!rentalReceiptBk;
    setSheetOpen(anyOpen);
    return () => setSheetOpen(false);
  }, [sheetOrder, rentalReceiptBk, setSheetOpen]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Admins in driver mode, gate-exempted drivers, or a globally-OFF gate all bypass the receipt check
  const isDriverActive = (user.role === 'admin' || user.role === 'superadmin')
    || !receiptGateActive
    || user.receiptGateExempt
    || (user.feeReceiptVerified && !!user.feeReceiptExpiry && new Date(user.feeReceiptExpiry) > new Date());

  // ── Rental helpers ────────────────────────────────────────────────────────
  const loadRentalData = useCallback(async () => {
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (!user.canRent && !isAdmin) return;
    setRentalLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id ?? '';

    // ── Admin: overview of ALL rental bookings across all owners ──
    if (isAdmin) {
      const { data: allBookings } = await supabase
        .from('rental_bookings')
        .select('id, booking_no, date, end_date, booking_type, start_hour, duration, persons, total_price, status, notes, license_url, created_at, owner_id, customer_id')
        .order('date', { ascending: false })
        .limit(100);

      let enriched: RentalBookingOwner[] = [];
      if (allBookings?.length) {
        const ownerIds    = [...new Set(allBookings.map(b => b.owner_id))];
        const customerIds = [...new Set(allBookings.map(b => b.customer_id))];
        const [{ data: ownerProfs }, { data: custProfs }, { data: vehicles }] = await Promise.all([
          supabase.from('profiles').select('id, name, phone').in('id', ownerIds),
          supabase.from('profiles').select('id, name, phone').in('id', customerIds),
          supabase.from('rental_vehicles').select('owner_id, car_type, plate_no').in('owner_id', ownerIds),
        ]);
        enriched = allBookings.map(b => {
          const op = ownerProfs?.find(p => p.id === b.owner_id);
          const cp = custProfs?.find(p => p.id === b.customer_id);
          const v  = vehicles?.find(v => v.owner_id === b.owner_id);
          return {
            ...b,
            start_hour:           Number(b.start_hour),
            duration:             Number(b.duration),
            customer_name:        cp?.name  ?? '—',
            customer_phone:       cp?.phone ?? '—',
            owner_name:           op?.name  ?? '—',
            owner_phone_display:  op?.phone ?? '',
            vehicle_label:        v ? `${v.car_type} · ${v.plate_no}` : '—',
          };
        });
      }
      setRentalVehicle(null);
      setVehicleForm({ car_type: '', plate_no: '', color: '', seats: 5, price_hour: 10, description: '', operating_start: 8, operating_end: 22, night_surcharge_on: false, night_surcharge_rate: 0 });
      setRentalBookings(enriched);
      setRentalBlocks([]);
      setPendingRentals(enriched.filter(b => b.status === 'pending').length);
      setRentalLoading(false);
      return;
    }

    // ── Owner (driver with can_rent): own vehicle + bookings ──
    const [{ data: vehicle }, { data: bookings }, { data: blocks }] = await Promise.all([
      supabase.from('rental_vehicles').select('*').eq('owner_id', uid).maybeSingle(),
      supabase.from('rental_bookings')
        .select('id, booking_no, date, end_date, booking_type, start_hour, duration, persons, total_price, status, notes, license_url, created_at, customer_id')
        .eq('owner_id', uid)
        .order('date', { ascending: false })
        .limit(50),
      supabase.from('rental_blocks').select('date, blocked_hours').eq('owner_id', uid),
    ]);

    let enriched: RentalBookingOwner[] = [];
    if (bookings?.length) {
      const customerIds = [...new Set(bookings.map(b => b.customer_id))];
      const { data: profiles } = await supabase
        .from('profiles').select('id, name, phone').in('id', customerIds);
      enriched = bookings.map(b => {
        const p = profiles?.find(p => p.id === b.customer_id);
        return {
          ...b,
          start_hour:     Number(b.start_hour),
          duration:       Number(b.duration),
          customer_name:  p?.name  ?? '—',
          customer_phone: p?.phone ?? '—',
        };
      });
    }

    setRentalVehicle(vehicle ?? null);
    setVehicleForm(vehicle ?? { car_type: '', plate_no: '', color: '', seats: 5, price_hour: 10, description: '', operating_start: 8, operating_end: 22, night_surcharge_on: false, night_surcharge_rate: 0 });
    setRentalBookings(enriched);
    setRentalBlocks(blocks ?? []);
    setPendingRentals(enriched.filter(b => b.status === 'pending').length);
    setRentalLoading(false);
  }, [user.canRent, user.role]);

  const toggleHourBlock = async (dateStr: string, hour: number) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id ?? '';
    const existing = rentalBlocks.find(b => b.date === dateStr);
    let newHours: number[];
    if (!existing) {
      newHours = [hour];
    } else if (existing.blocked_hours.length === 0) {
      // full-day block → unblock all except this one
      newHours = HOURS.filter(h => h !== hour);
    } else if (existing.blocked_hours.includes(hour)) {
      newHours = existing.blocked_hours.filter(h => h !== hour);
    } else {
      newHours = [...existing.blocked_hours, hour];
    }
    await supabase.from('rental_blocks').upsert({ owner_id: uid, date: dateStr, blocked_hours: newHours });
    loadRentalData();
  };

  const blockFullDay = async (dateStr: string, block: boolean) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id ?? '';
    if (block) {
      await supabase.from('rental_blocks').upsert({ owner_id: uid, date: dateStr, blocked_hours: [] });
    } else {
      await supabase.from('rental_blocks').delete().eq('owner_id', uid).eq('date', dateStr);
    }
    loadRentalData();
  };

  const updateBookingStatus = async (bookingId: string, status: string) => {
    await supabase.from('rental_bookings').update({ status }).eq('id', bookingId);
    loadRentalData();
  };

  const saveVehicle = async () => {
    if (!vehicleForm.car_type || !vehicleForm.plate_no) { showToast('Fill in car type and plate number.'); return; }
    setVehicleSaving(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id ?? '';
    await supabase.from('rental_vehicles').upsert({
      owner_id: uid,
      car_type:             vehicleForm.car_type             ?? '',
      plate_no:             vehicleForm.plate_no             ?? '',
      color:                vehicleForm.color                ?? '',
      seats:                vehicleForm.seats                ?? 5,
      price_hour:           vehicleForm.price_hour           ?? 10,
      description:          vehicleForm.description          ?? '',
      operating_start:      vehicleForm.operating_start      ?? 8,
      operating_end:        vehicleForm.operating_end        ?? 22,
      night_surcharge_on:   vehicleForm.night_surcharge_on   ?? false,
      night_surcharge_rate: vehicleForm.night_surcharge_rate ?? 0,
      updated_at:  new Date().toISOString(),
    });
    setVehicleSaving(false);
    showToast('Vehicle info saved!');
    loadRentalData();
  };

  // Rental calendar helpers
  const rentalCalDays = (): (string | null)[] => {
    const { year, month } = rentalMonth;
    const first = new Date(year, month, 1).getDay();
    const days  = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return cells;
  };
  const rentalMonthLabel = () =>
    new Date(rentalMonth.year, rentalMonth.month, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
  const isFullDayBlocked = (dateStr: string) => {
    const b = rentalBlocks.find(b => b.date === dateStr);
    return !!b && b.blocked_hours.length === 0;
  };
  const blockedHoursOn = (dateStr: string): number[] => {
    const b = rentalBlocks.find(b => b.date === dateStr);
    if (!b) return [];
    if (b.blocked_hours.length === 0) return HOURS;
    return b.blocked_hours;
  };

  const campusFilter = user.role === 'superadmin'
    ? null
    : user.campus.charAt(0).toUpperCase() + user.campus.slice(1).toLowerCase();

  const loadOrders = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const uid = authUser?.id ?? '';

    const RIDE_FIELDS = 'id,customer_name,campus,date,time,pickup,destination,passengers,contact,fare,night_charge,notes,status,driver_id,driver_name,created_at,accepted_at';

    // Pool: pending orders for this campus, sorted by scheduled date+time (FIFO)
    let pendingQ = supabase
      .from('ride_orders')
      .select(RIDE_FIELDS)
      .eq('status', 'pending')
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    if (campusFilter) pendingQ = pendingQ.eq('campus', campusFilter);
    const { data: pending } = await pendingQ;

    // Active job (accepted or in_progress)
    const { data: mine } = await supabase
      .from('ride_orders')
      .select(RIDE_FIELDS)
      .eq('driver_id', uid)
      .in('status', ['accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Full driver history (completed + cancelled + accepted/in_progress for context)
    const { data: history } = await supabase
      .from('ride_orders')
      .select(RIDE_FIELDS)
      .eq('driver_id', uid)
      .in('status', ['completed', 'cancelled', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(50);

    const pool = pending ?? [];

    // Ping animation when new orders arrive in pool
    if (pool.length > prevPoolCount.current && prevPoolCount.current >= 0) {
      setNewPing(true);
      setTimeout(() => setNewPing(false), 2000);
    }
    prevPoolCount.current = pool.length;

    setPendingOrders(pool);
    setMyJob(mine ?? null);
    setMyHistory((history ?? []).filter(o => !(mine && o.id === mine.id)));
    setLoading(false);
  }, [campusFilter]);

  // Request notification permission once when driver loads
  useEffect(() => {
    if (!effectiveCanDrive) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [effectiveCanDrive]);

  // Debounce refs — ride orders
  const notifTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifCount  = useRef(0);

  // Debounce refs — rental bookings
  const notifRentalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifRentalCount = useRef(0);

  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, start: number, dur: number) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start);
        osc.stop(start + dur);
      };
      playTone(880,  ctx.currentTime,        0.18); // A5 — first ding
      playTone(1108, ctx.currentTime + 0.18, 0.35); // C#6 — second ding
    } catch {
      // AudioContext blocked — silent fallback
    }
  }, []);

  const fireNotification = useCallback(() => {
    const count = notifCount.current;
    notifCount.current = 0;
    playChime();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Gerak — New Ride Request', {
        body: count > 1 ? `${count} new ride requests in queue` : 'A new ride request is waiting for you.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'gerak-new-order',
      });
    }
  }, [playChime]);

  const fireRentalNotification = useCallback(() => {
    const count = notifRentalCount.current;
    notifRentalCount.current = 0;
    playChime();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Gerak — New Rental Booking', {
        body: count > 1 ? `${count} new rental bookings awaiting your confirmation` : 'A new rental booking is awaiting your confirmation.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'gerak-new-rental',
      });
    }
  }, [playChime]);

  useEffect(() => {
    if (!effectiveCanDrive) { setLoading(false); return; }
    loadOrders();
    const channel = supabase
      .channel('ride_orders_driver')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_orders' }, (payload) => {
        loadOrders();
        if (payload.eventType === 'INSERT') {
          notifCount.current += 1;
          if (notifTimer.current) clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(fireNotification, 3000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadOrders, effectiveCanDrive, fireNotification]);

  useEffect(() => {
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (!user.canRent && !isAdmin) return;
    loadRentalData();
    const channel = supabase
      .channel('rental_bookings_owner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_bookings' }, (payload) => {
        loadRentalData();
        if (payload.eventType === 'INSERT') {
          notifRentalCount.current += 1;
          if (notifRentalTimer.current) clearTimeout(notifRentalTimer.current);
          notifRentalTimer.current = setTimeout(fireRentalNotification, 2000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.canRent, user.role, loadRentalData, fireRentalNotification]);

  const handleAccept = async (orderId: string) => {
    setAccepting(orderId);
    // Optimistically remove from pool so it vanishes instantly for this driver
    setPendingOrders(prev => prev.filter(o => o.id !== orderId));
    const { data, error } = await supabase.rpc('accept_ride_order', { p_order_id: orderId });
    setAccepting(null);
    if (error || !data?.success) {
      // Race lost — job was already taken; refresh pool and inform driver
      showToast('🔒 Job just taken by another driver.');
      loadOrders();
    } else {
      showToast('Job accepted! Check My Jobs tab.');
      setActiveTab('my-jobs');
      loadOrders();
    }
  };

  const handleStatusUpdate = async (orderId: string, status: string) => {
    setUpdating(true);
    await supabase.rpc('update_ride_status', { p_order_id: orderId, p_status: status });
    setUpdating(false);
    if (status === 'completed') showToast('Trip completed!');
    loadOrders();
  };

  // Countdown timer — ticks every second while job is accepted
  useEffect(() => {
    if (!myJob || myJob.status !== 'accepted' || !myJob.accepted_at) {
      setCancelSecsLeft(0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(myJob.accepted_at!).getTime()) / 1000);
      setCancelSecsLeft(Math.max(0, 180 - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [myJob?.id, myJob?.status, myJob?.accepted_at]);

  const handleCancel = async () => {
    if (cancelSecsLeft <= 0 || !myJob) return;
    setUpdating(true);
    const { data, error } = await supabase.rpc('cancel_ride_order', { p_order_id: myJob.id });
    setUpdating(false);
    if (error || !data?.success) {
      showToast(data?.error ?? 'Cannot cancel — window expired.');
    } else {
      showToast('Job cancelled. Returned to pool.');
      setActiveTab('pool');
      loadOrders();
    }
  };

  const fmtCountdown = (secs: number) =>
    `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

  const fmt = (order: RideOrder) =>
    order.fare === 'TBC' ? 'TBC' : `RM ${(Number(order.fare) + order.night_charge).toFixed(2)}`;

  // ── Document upload handler ──────────────────────────────────────────────────
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ic' | 'license') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('File too large. Max 10MB.'); return; }
    setUploadingDoc(type);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) { setUploadingDoc(null); return; }
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${authUser.id}/${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, file, { upsert: true });
    if (upErr) { showToast('Upload failed. Please try again.'); setUploadingDoc(null); return; }
    const { data: signed } = await supabase.storage.from('driver-documents').createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl ?? '';
    const col = type === 'ic' ? { ic_url: url } : { license_url: url };
    await supabase.from('profiles').update({ ...col, docs_status: 'pending' }).eq('id', authUser.id);
    setUploadingDoc(null);
    if (e.target) e.target.value = '';
    await refreshUserData();
    showToast(type === 'ic' ? 'IC uploaded!' : 'License uploaded!');
  };

  // ── Gate 1: Document verification guard ──────────────────────────────────────
  const isAdminRole = user.role === 'admin' || user.role === 'superadmin';

  if (!isAdminRole && user.docsStatus !== 'approved') {
    const bothUploaded = !!user.icUrl && !!user.licenseUrl;
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 px-5 flex flex-col gap-5 animate-fade-in">
        <div className="mt-6 flex flex-col items-center text-center gap-2">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 ${
            user.docsStatus === 'rejected' ? 'bg-red-50 border-red-100' :
            user.docsStatus === 'pending'  ? 'bg-amber-50 border-amber-100' :
            'bg-slate-50 border-slate-100'
          }`}>
            {user.docsStatus === 'rejected' ? <ShieldAlert className="w-7 h-7 text-red-400" /> :
             user.docsStatus === 'pending'  ? <ShieldCheck className="w-7 h-7 text-amber-400" /> :
             <ShieldCheck className="w-7 h-7 text-slate-300" />}
          </div>
          <p className="text-sm font-semibold text-slate-800">
            {user.docsStatus === 'pending'  ? 'Documents Under Review' :
             user.docsStatus === 'rejected' ? 'Documents Rejected' :
             'Complete Verification'}
          </p>
          <p className="text-xs text-slate-400 font-normal leading-relaxed max-w-xs">
            {user.docsStatus === 'pending'  ? 'Your documents are being reviewed by admin. You will be notified once approved.' :
             user.docsStatus === 'rejected' ? `Reason: ${user.docsRejectReason || 'Please re-upload correct documents.'}` :
             'Upload your IC (MyKad) and Driving License to get verified as a Gerak Driver.'}
          </p>
        </div>

        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Required Documents</h3>

          {/* IC Upload */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400">Identity Card (MyKad) *</label>
            <input ref={icDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'ic')} />
            {user.icUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700">IC Uploaded ✓</span>
                </div>
                <button onClick={() => icDocRef.current?.click()}
                  className="text-xs font-semibold text-slate-400 underline">
                  {uploadingDoc === 'ic' ? 'Uploading…' : 'Replace'}
                </button>
              </div>
            ) : (
              <button onClick={() => icDocRef.current?.click()} disabled={uploadingDoc === 'ic'}
                className="w-full border-2 border-dashed border-slate-100 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                {uploadingDoc === 'ic'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                  : <><Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload IC (MyKad)</span></>}
              </button>
            )}
          </div>

          {/* License Upload */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400">Driving License *</label>
            <input ref={licenseDocRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleDocUpload(e, 'license')} />
            {user.licenseUrl ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700">License Uploaded ✓</span>
                </div>
                <button onClick={() => licenseDocRef.current?.click()}
                  className="text-xs font-semibold text-slate-400 underline">
                  {uploadingDoc === 'license' ? 'Uploading…' : 'Replace'}
                </button>
              </div>
            ) : (
              <button onClick={() => licenseDocRef.current?.click()} disabled={uploadingDoc === 'license'}
                className="w-full border-2 border-dashed border-slate-100 rounded-2xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:border-primary hover:text-primary transition active:scale-95">
                {uploadingDoc === 'license'
                  ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
                  : <><Upload className="w-4 h-4" /><span className="text-xs font-semibold">Upload Driving License</span></>}
              </button>
            )}
          </div>

          {bothUploaded && user.docsStatus === 'none' && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-center">
              <p className="text-xs font-semibold text-amber-700">Documents submitted for review</p>
              <p className="text-xs text-amber-500 font-normal mt-0.5">Admin will verify your documents shortly.</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-slate-400 font-normal text-center leading-relaxed">
            Your Gerak ID: <span className="font-semibold text-slate-600">{user.gerakId}</span><br />
            Documents are reviewed within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  // ── Suspended guard ──────────────────────────────────────────────────────────
  if (user.status === 'inactive' && user.role !== 'superadmin') {
    return (
      <div className="flex-grow bg-white flex flex-col items-center justify-center px-8 gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center">
          <Car className="w-7 h-7 text-red-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">Account Suspended</p>
          <p className="text-xs text-slate-400 font-normal mt-1 leading-relaxed">
            Your driver account has been suspended.<br />Please contact your admin to reactivate.
          </p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-center">
          <p className="text-xs font-semibold text-red-400">Gerak ID</p>
          <p className="text-sm font-semibold text-red-600 mt-0.5">{user.gerakId}</p>
        </div>
      </div>
    );
  }

  return (
  <>
    {sheetOrder && (
      <OrderReceiptSheet
        order={sheetOrder}
        onClose={() => setSheetOrder(null)}
        showWhatsApp={sheetOrder.status === 'completed' || sheetOrder.status === 'cancelled'}
      />
    )}
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 flex flex-col animate-fade-in">

      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-800 m-0">Driver Hub</h2>
            <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </div>
          <p className="text-xs text-slate-400 font-normal mt-0.5">
            {user.name} · {user.gerakId} · UMPSA {user.campus}
          </p>
        </div>
        <button
          onClick={() => (activeTab === 'rental' && effectiveCanRent) ? loadRentalData() : loadOrders()}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-primary transition active:scale-90"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg text-center">
          {toast}
        </div>
      )}

      {/* ── Tab Switcher ── */}
      <div className="px-4 mb-1">
        <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">

          {/* Pool tab — only if can_drive */}
          {effectiveCanDrive && (
            <button
              onClick={() => setActiveTab('pool')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition relative ${
                activeTab === 'pool' ? 'bg-primary text-white' : 'text-slate-400'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Job Pool
              {pendingOrders.length > 0 && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                  activeTab === 'pool'
                    ? 'bg-white/25 text-white'
                    : `bg-primary text-white ${newPing ? 'animate-bounce' : ''}`
                }`}>
                  {pendingOrders.length}
                </span>
              )}
            </button>
          )}

          {/* My Jobs tab — only if can_drive */}
          {effectiveCanDrive && (
            <button
              onClick={() => setActiveTab('my-jobs')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition relative ${
                activeTab === 'my-jobs' ? 'bg-primary text-white' : 'text-slate-400'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              My Jobs
              {myJob && (
                <span className={`w-2 h-2 rounded-full ${
                  myJob.status === 'in_progress' ? 'bg-blue-400' : 'bg-emerald-400'
                } ${activeTab === 'my-jobs' ? 'bg-white' : ''} animate-pulse`} />
              )}
            </button>
          )}

          {/* Rental tab — owners + admins */}
          {effectiveCanRent && (
            <button
              onClick={() => setActiveTab('rental')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition relative ${
                activeTab === 'rental' ? 'bg-amber-500 text-white' : 'text-slate-400'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Rental
              {pendingRentals > 0 && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                  activeTab === 'rental' ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {pendingRentals}
                </span>
              )}
            </button>
          )}

          {/* Earnings tab — only if can_drive */}
          {effectiveCanDrive && (
            <button
              onClick={() => setActiveTab('earnings')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'earnings' ? 'bg-emerald-500 text-white' : 'text-slate-400'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Earnings
            </button>
          )}

        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center py-16">
          <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB 1: JOB POOL
      ══════════════════════════════════════════ */}
      {!loading && activeTab === 'pool' && (
        <div className="px-4 pt-2 flex flex-col gap-4">

          {/* Inactive driver lock banner */}
          {!isDriverActive && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <ShieldOff className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-600">Account inactive — cannot accept jobs</p>
                <p className="text-xs text-red-400 font-normal mt-0.5 leading-relaxed">
                  Upload your monthly fee receipt in <strong>Profile</strong> to activate your account.
                </p>
              </div>
            </div>
          )}

          {myJob && isDriverActive && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs font-semibold text-amber-700">
                You have an active trip. Complete it before accepting a new job.
              </p>
            </div>
          )}

          {pendingOrders.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-3xl p-10 flex flex-col items-center gap-3 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                  <Car className="w-7 h-7 text-slate-300" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Queue is clear</p>
                <p className="text-xs text-slate-400 font-normal mt-1 leading-relaxed">
                  New orders appear here instantly,<br />sorted by booking time.
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-600">Connected · UMPSA {user.campus}</span>
              </div>
            </div>
          ) : (
            pendingOrders.map((order, idx) => (
              <div key={order.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden cursor-pointer" onClick={() => setSheetOrder(order)}>

                {/* Queue position strip */}
                <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {idx === 0 ? 'Next in queue' : `Queue position ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                    <Clock className="w-3 h-3" />
                    {order.date} · {order.time}
                  </div>
                </div>

                {/* Customer + fare */}
                <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{order.customer_name}</p>
                    <p className="text-xs text-slate-400 font-normal mt-0.5 flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> {order.passengers} pax
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-black leading-tight ${order.fare === 'TBC' ? 'text-slate-400' : 'text-slate-800'}`}>
                      {fmt(order)}
                    </p>
                    {order.night_charge > 0 && (
                      <p className="text-xs text-amber-500 font-bold">+RM{order.night_charge} night</p>
                    )}
                  </div>
                </div>

                {/* Route */}
                <div className="mx-4 mb-3 bg-slate-50 rounded-2xl px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center gap-0.5 mt-0.5 shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <div className="w-px h-4 bg-slate-200" />
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                    </div>
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <div>
                        <p className="text-xs text-slate-400 font-normal">Pick-up</p>
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{order.pickup}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 font-normal">Drop-off</p>
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{order.destination}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact — hidden when driver is inactive */}
                {isDriverActive && (
                  <div className="mx-4 mb-3 flex items-center gap-2 text-xs text-slate-500 font-normal">
                    <a
                      href={`https://wa.me/${order.contact.replace(/\D/g,'').replace(/^0/,'60')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-[#25D366]/10 text-[#25D366] font-semibold px-3 py-1.5 rounded-full text-xs active:scale-95 transition"
                      onClick={e => e.stopPropagation()}
                    >
                      <WaIcon className="w-3 h-3" /> {order.contact}
                    </a>
                  </div>
                )}

                {order.notes && (
                  <p className="mx-4 mb-3 text-xs text-slate-500 italic bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Remark: "{order.notes}"
                  </p>
                )}

                {/* Accept */}
                <div className="px-4 pb-4" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => isDriverActive && handleAccept(order.id)}
                    disabled={!isDriverActive || !!accepting || !!myJob}
                    className="w-full bg-primary hover:bg-primary-hover text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    {accepting === order.id
                      ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      : !isDriverActive
                        ? <><ShieldOff className="w-3.5 h-3.5" /> Activate account to accept</>
                        : myJob
                          ? 'Finish current trip first'
                          : <><Briefcase className="w-3.5 h-3.5" /> Accept Job</>}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB 2: MY JOBS
      ══════════════════════════════════════════ */}
      {!loading && activeTab === 'my-jobs' && (
        <div className="px-4 pt-2 flex flex-col gap-4">

          {/* ── Active job ── */}
          {myJob ? (
            <div className="flex flex-col gap-4">
              <div className={`rounded-2xl px-4 py-2.5 flex items-center justify-between ${
                myJob.status === 'in_progress' ? 'bg-blue-600' : 'bg-emerald-600'
              }`}>
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-white opacity-80" />
                  <span className="text-white text-xs font-semibold uppercase tracking-wide">
                    {myJob.status === 'in_progress' ? 'Trip In Progress' : 'Job Accepted'}
                  </span>
                </div>
                <span className="text-white/70 text-xs font-normal">{myJob.date} · {myJob.time}</span>
              </div>

              <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden cursor-pointer" onClick={() => setSheetOrder(myJob)}>
                <div className="px-5 pt-5 pb-4 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-normal text-slate-400">Customer</p>
                    <p className="text-xs font-normal text-slate-400">Fare</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{myJob.customer_name}</p>
                    <p className="text-sm font-black text-slate-800 shrink-0">{fmt(myJob)}</p>
                  </div>
                  {myJob.night_charge > 0 && (
                    <p className="text-xs text-amber-500 font-bold text-right">Night +RM{myJob.night_charge}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Users className="w-3 h-3" /> {myJob.passengers} passenger{myJob.passengers > 1 ? 's' : ''}
                  </p>
                </div>

                <div className="mx-4 mb-4 bg-slate-50 rounded-2xl px-4 py-3 flex flex-col gap-2.5">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 mt-0.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                      <div className="w-0.5 h-5 bg-slate-200" />
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    </div>
                    <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                      <div>
                        <p className="text-xs font-normal text-slate-400">Pickup</p>
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{myJob.pickup}</p>
                      </div>
                      <div>
                        <p className="text-xs font-normal text-slate-400">Destination</p>
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{myJob.destination}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {myJob.notes && (
                  <p className="mx-4 mb-3 text-xs text-slate-500 italic bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Remark: "{myJob.notes}"
                  </p>
                )}

                {/* Single action row: primary action + WhatsApp + cancel */}
                <div className="px-4 pb-5 flex gap-2" onClick={e => e.stopPropagation()}>

                  {/* Primary — Start Trip or Complete Trip */}
                  {myJob.status === 'accepted' && (
                    <button
                      onClick={() => handleStatusUpdate(myJob.id, 'in_progress')}
                      disabled={updating}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50 shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5"
                    >
                      {updating
                        ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        : <><Car className="w-3.5 h-3.5" /> Start Trip</>}
                    </button>
                  )}
                  {myJob.status === 'in_progress' && (
                    <button
                      onClick={() => handleStatusUpdate(myJob.id, 'completed')}
                      disabled={updating}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-500/25 flex items-center justify-center gap-1.5"
                    >
                      {updating
                        ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Complete Trip</>}
                    </button>
                  )}

                  {/* WhatsApp */}
                  <a
                    href={(() => {
                      const phone = myJob.contact.replace(/\D/g,'').replace(/^0/,'60');
                      const [y, m, d] = myJob.date.split('-');
                      const dateFormatted = `${d}/${m}/${y}`;
                      const msg = [
                        `Hi, I'm your Gerak driver. I've accepted your ride order. Here are the details:`,
                        ``,
                        `Date: ${dateFormatted}`,
                        `Time: ${myJob.time}`,
                        `Pickup: ${myJob.pickup}`,
                        `Destination: ${myJob.destination}`,
                        `Passengers: ${myJob.passengers}`,
                        `Contact: ${myJob.contact}`,
                        ``,
                        `See you soon!`,
                      ].join('\n');
                      return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#25D366] active:scale-90 transition shrink-0"
                    aria-label="WhatsApp customer"
                  >
                    <WaIcon className="w-9 h-9" />
                  </a>

                  {/* Cancel — only within 3-min window, only before trip starts */}
                  {myJob.status !== 'in_progress' && cancelSecsLeft > 0 && (
                    <button
                      onClick={handleCancel}
                      disabled={updating}
                      className="flex flex-col items-center justify-center bg-red-50 border border-red-100 text-red-500 font-semibold text-xs px-3 py-2 rounded-2xl transition active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      <XCircle className="w-3.5 h-3.5 mb-0.5" />
                      {fmtCountdown(cancelSecsLeft)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-100/60 border border-slate-100/60 rounded-2xl px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-xs font-normal text-slate-500">No active trip right now. Accept a job from the Pool tab.</p>
            </div>
          )}

          {/* ── History ── */}
          {(() => {
            const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            const visibleHistory = myHistory.filter(o =>
              o.status !== 'cancelled' || new Date(o.created_at).getTime() >= thirtyDaysAgo
            );
            return visibleHistory.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 pt-1">
                <Clock className="w-3.5 h-3.5" /> Trip History
              </h3>

              {visibleHistory.map(order => {
                const st = HISTORY_STATUS[order.status] ?? HISTORY_STATUS.cancelled;
                return (
                  <div key={order.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden cursor-pointer" onClick={() => setSheetOrder(order)}>

                    {/* Header row */}
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-slate-800 truncate">{order.customer_name}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                            {st.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-normal mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {order.date} · {order.time} &nbsp;·&nbsp;
                          <Users className="w-3 h-3" /> {order.passengers} pax
                        </p>
                      </div>
                      <p className={`text-sm font-black shrink-0 ${order.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {fmt(order)}
                      </p>
                    </div>

                    {/* Route mini */}
                    <div className="mx-4 mb-4 bg-slate-50 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                        <span className="font-normal text-slate-500 truncate">{order.pickup}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Navigation className="w-3 h-3 text-red-400 shrink-0" />
                        <span className="font-normal text-slate-500 truncate">{order.destination}</span>
                      </div>
                      {order.notes && (
                        <p className="text-xs text-slate-400 italic mt-1">"{order.notes}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })()}

          {!myJob && myHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No jobs yet</p>
              <p className="text-xs text-slate-400 font-normal">Your accepted and completed trips will appear here.</p>
            </div>
          )}

        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: EARNINGS
      ══════════════════════════════════════════ */}
      {!loading && activeTab === 'earnings' && effectiveCanDrive && (() => {
        const completed = myHistory.filter(o => o.status === 'completed');

        const [selY, selM] = earningsMonth.split('-');
        const monthLabel = new Date(Number(selY), Number(selM) - 1, 1)
          .toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
        const month = computeEarnings(completed, earningsMonth);
        const allTime = computeEarnings(completed);

        return (
          <div className="flex flex-col gap-4 px-4">
            {/* Drum picker */}
            <MonthDrumPicker value={earningsMonth} onChange={setEarningsMonth} />

            {/* Month earnings */}
            <EarningsCard label={monthLabel} earned={month.earned} tbc={month.tbc} rows={month.rows} />

            {/* All time earnings */}
            <EarningsCard label="All Time" earned={allTime.earned} tbc={allTime.tbc} rows={allTime.rows} />
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          TAB 3: RENTAL (owners only)
      ══════════════════════════════════════════ */}
      {!loading && activeTab === 'rental' && effectiveCanRent && (
        <div className="px-4 pt-2 flex flex-col gap-4">

          {/* Sub-view switcher — admin sees Orders only; owner sees all 4 */}
          <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
            {([
              { v: 'orders',   Icon: Package,      label: 'Orders',   ownerOnly: false },
              { v: 'schedule', Icon: CalendarDays,  label: 'Schedule', ownerOnly: true  },
              { v: 'vehicle',  Icon: Settings,      label: 'Vehicle',  ownerOnly: true  },
              { v: 'pricing',  Icon: DollarSign,    label: 'Pricing',  ownerOnly: true  },
            ] as const)
              .filter(({ ownerOnly }) => !ownerOnly || !isAdminForRental)
              .map(({ v, Icon, label }) => (
                <button key={v} onClick={() => setRentalSubView(v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition flex flex-col items-center gap-0.5 ${
                    rentalSubView === v ? 'bg-amber-500 text-white' : 'text-slate-400'
                  }`}>
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
          </div>

          {rentalLoading && (
            <div className="flex justify-center py-10">
              <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin" />
            </div>
          )}

          {/* ── ORDERS sub-view ── */}
          {!rentalLoading && rentalSubView === 'orders' && (
            <div className="flex flex-col gap-4">
              {rentalBookings.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center flex flex-col items-center gap-2">
                  <Package className="w-8 h-8 text-slate-200" />
                  <p className="text-xs text-slate-400 font-normal">No rental bookings yet.</p>
                </div>
              ) : rentalBookings.map(bk => {
                const statusStyle: Record<string, string> = {
                  pending:   'bg-amber-50 text-amber-700 border-amber-200',
                  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  cancelled: 'bg-red-50 text-red-500 border-red-200',
                  completed: 'bg-slate-100 text-slate-500 border-slate-200',
                };
                return (
                  <div key={bk.id} onClick={() => setRentalReceiptBk(bk)}
                    className="bg-white border border-slate-100 rounded-3xl overflow-hidden cursor-pointer active:scale-[0.99] transition">
                    <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-500">
                        {bk.booking_type === 'fullday' && bk.end_date && bk.end_date !== bk.date
                          ? `${bk.date} → ${bk.end_date} · Full Day`
                          : `${bk.date} · ${fmt12(bk.start_hour)} – ${fmt12(bk.start_hour + bk.duration)}`}
                      </p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border uppercase ${statusStyle[bk.status] ?? statusStyle.pending}`}>
                        {bk.status}
                      </span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{bk.customer_name}</p>
                        {isAdminForRental && bk.owner_name && (
                          <p className="text-xs text-slate-400 font-normal truncate">
                            Owner: {bk.owner_name} · {bk.vehicle_label}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 font-normal flex items-center gap-2 flex-wrap">
                          {bk.persons} pax · {fmtDuration(bk.duration)}
                          {!bk.license_url && <span className="text-amber-500 font-semibold">· License pending</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-black text-amber-600">RM{Number(bk.total_price).toFixed(2)}</p>
                        {bk.customer_phone && bk.customer_phone !== '—' && (
                          <a
                            href={`https://wa.me/${toWa(bk.customer_phone)}?text=${encodeURIComponent(`Hi ${bk.customer_name}, regarding your rental booking #${String(bk.booking_no).padStart(5, '0')} — just confirming your details. Please let me know if you have any questions!`)}`}
                            target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="w-8 h-8 flex items-center justify-center bg-emerald-500 text-white rounded-xl active:scale-90 transition shrink-0"
                          >
                            <WaIcon className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SCHEDULE sub-view ── */}
          {!rentalLoading && rentalSubView === 'schedule' && (
            <div className="flex flex-col gap-4">

              {/* Calendar */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setRentalMonth(m => {
                    const d = new Date(m.year, m.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })} className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-xs font-semibold text-slate-700">{rentalMonthLabel()}</p>
                  <button onClick={() => setRentalMonth(m => {
                    const d = new Date(m.year, m.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })} className="w-7 h-7 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 active:scale-90">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-1">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-slate-400">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {rentalCalDays().map((dateStr, i) => {
                    if (!dateStr) return <div key={i} />;
                    const isPast    = dateStr < todayStr();
                    const isBlocked = isFullDayBlocked(dateStr);
                    const isPicked  = dateStr === scheduleDate;
                    return (
                      <button key={dateStr} disabled={isPast}
                        onClick={() => setScheduleDate(dateStr)}
                        className={`aspect-square rounded-xl text-xs font-semibold transition active:scale-90 ${
                          isPicked   ? 'bg-amber-500 text-white' :
                          isBlocked  ? 'bg-red-100 text-red-400' :
                          isPast     ? 'text-slate-200 cursor-not-allowed' :
                                       'text-slate-700 hover:bg-amber-50'
                        }`}>
                        {parseInt(dateStr.split('-')[2])}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-3 text-xs font-normal text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Blocked</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Selected</span>
                </div>
              </div>

              {/* Hour-level controls for selected date */}
              {scheduleDate && (
                <div className="bg-white border border-slate-100 rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-700">{scheduleDate}</p>
                    <div className="flex gap-2">
                      <button onClick={() => blockFullDay(scheduleDate, true)}
                        className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-xl active:scale-95 transition">
                        <Ban className="w-3 h-3" /> Block All
                      </button>
                      <button onClick={() => blockFullDay(scheduleDate, false)}
                        className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-xl active:scale-95 transition">
                        <Unlock className="w-3 h-3" /> Open All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {HOURS.map(h => {
                      const blocked = blockedHoursOn(scheduleDate).includes(h);
                      return (
                        <button key={h} onClick={() => toggleHourBlock(scheduleDate, h)}
                          className={`py-2 rounded-xl text-xs font-semibold transition active:scale-95 ${
                            blocked
                              ? 'bg-red-100 text-red-500 border border-red-200'
                              : 'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                          }`}>
                          {fmt12(h)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 font-normal text-center mt-3">
                    Tap a slot to toggle. Red = blocked from customers.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── PRICING sub-view ── */}
          {!rentalLoading && rentalSubView === 'pricing' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-5">
              <p className="text-sm font-semibold text-slate-700">Pricing & Operating Hours</p>

              {/* Hourly rate */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Hourly Rate (RM)</label>
                <input
                  type="number" min="1" step="0.50"
                  value={vehicleForm.price_hour ?? 10}
                  onChange={e => setVehicleForm(f => ({ ...f, price_hour: Number(e.target.value) }))}
                  className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-400 transition"
                />
              </div>

              {/* Operating hours */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">Operating Hours (Full-Day Bookings)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-400">Pickup Time</span>
                    <select
                      value={vehicleForm.operating_start ?? 8}
                      onChange={e => setVehicleForm(f => ({ ...f, operating_start: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-400 transition"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-400">Return Time</span>
                    <select
                      value={vehicleForm.operating_end ?? 22}
                      onChange={e => setVehicleForm(f => ({ ...f, operating_end: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-400 transition"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-400 font-normal">
                  Full-day bookings will use these times as pickup and return.
                </p>
              </div>

              {/* Night surcharge */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Moon className="w-3.5 h-3.5 text-indigo-400" /> Night Surcharge
                    </p>
                    <p className="text-xs text-slate-400 font-normal mt-0.5">Applies 10 PM – 5 AM for hourly bookings</p>
                  </div>
                  <button
                    onClick={() => setVehicleForm(f => ({ ...f, night_surcharge_on: !f.night_surcharge_on }))}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                      vehicleForm.night_surcharge_on ? 'bg-indigo-500' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      vehicleForm.night_surcharge_on ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                {vehicleForm.night_surcharge_on && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-400">Extra Rate / Hour (RM)</label>
                    <input
                      type="number" min="0" step="0.50"
                      value={vehicleForm.night_surcharge_rate ?? 0}
                      onChange={e => setVehicleForm(f => ({ ...f, night_surcharge_rate: Number(e.target.value) }))}
                      placeholder="e.g. 5.00"
                      className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-amber-400 transition"
                    />
                    <p className="text-xs text-slate-400 font-normal">
                      Night hours = normal rate + this extra amount per hour.
                    </p>
                  </div>
                )}
              </div>

              <button onClick={saveVehicle} disabled={vehicleSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {vehicleSaving
                  ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <><CheckCircle2 className="w-4 h-4" /> Save Pricing</>}
              </button>
            </div>
          )}

          {/* ── VEHICLE sub-view ── */}
          {!rentalLoading && rentalSubView === 'vehicle' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-700">Vehicle Information</p>

              {[
                { label: 'Car Type / Model', key: 'car_type' as const, placeholder: 'e.g. Perodua Myvi' },
                { label: 'Plate Number', key: 'plate_no' as const, placeholder: 'e.g. ABC 1234' },
                { label: 'Color', key: 'color' as const, placeholder: 'e.g. Silver' },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">{label}</label>
                  <input
                    value={vehicleForm[key] as string ?? ''}
                    onChange={e => setVehicleForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-amber-400 transition"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">Seats</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setVehicleForm(f => ({ ...f, seats: Math.max(1, (f.seats ?? 5) - 1) }))}
                      className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-semibold flex items-center justify-center active:scale-90">−</button>
                    <span className="flex-1 text-center text-sm font-semibold text-slate-800">{vehicleForm.seats ?? 5}</span>
                    <button onClick={() => setVehicleForm(f => ({ ...f, seats: Math.min(15, (f.seats ?? 5) + 1) }))}
                      className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-semibold flex items-center justify-center active:scale-90">+</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400">Price/Hour (RM)</label>
                  <input
                    type="number" min="1" step="0.50"
                    value={vehicleForm.price_hour ?? 10}
                    onChange={e => setVehicleForm(f => ({ ...f, price_hour: Number(e.target.value) }))}
                    className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-amber-400 transition"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Description (optional)</label>
                <textarea
                  value={vehicleForm.description ?? ''}
                  onChange={e => setVehicleForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Any details customers should know..."
                  className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-amber-400 transition resize-none"
                />
              </div>

              <button onClick={saveVehicle} disabled={vehicleSaving}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {vehicleSaving
                  ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  : <><CheckCircle2 className="w-4 h-4" /> Save Vehicle Info</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── RENTAL BOOKING RECEIPT MODAL ── */}
    {rentalReceiptBk && (() => {
      const bk = rentalReceiptBk;
      const statusStyle: Record<string, string> = {
        pending:   'bg-amber-50 text-amber-700 border-amber-200',
        confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        cancelled: 'bg-red-50 text-red-500 border-red-200',
        completed: 'bg-slate-100 text-slate-500 border-slate-200',
      };
      const priceHour = rentalVehicle?.price_hour ?? 0;
      return (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setRentalReceiptBk(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-sm rounded-t-3xl bg-white overflow-hidden animate-slide-up"
            onClick={e => e.stopPropagation()}>

            {/* Close handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            {/* Receipt header */}
            <div className="bg-amber-500 mx-4 mt-2 mb-0 rounded-2xl px-5 pt-4 pb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-100">Rental Booking</p>
                <p className="text-lg font-semibold text-white leading-tight mt-0.5">
                  {bk.vehicle_label ?? rentalVehicle?.car_type ?? 'Vehicle'}
                </p>
                {!bk.vehicle_label && (
                  <p className="text-xs text-amber-100 font-normal">
                    {rentalVehicle?.plate_no} · {rentalVehicle?.color}
                  </p>
                )}
                {isAdminForRental && bk.owner_name && (
                  <p className="text-xs text-amber-100 font-normal">Owner: {bk.owner_name}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border uppercase ${statusStyle[bk.status] ?? statusStyle.pending}`}>
                  {bk.status}
                </span>
                <button onClick={() => setRentalReceiptBk(null)}
                  className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white active:scale-90 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto no-scrollbar max-h-[65vh]">

              {/* Date / Time / Duration */}
              {bk.booking_type === 'fullday' && bk.end_date && bk.end_date !== bk.date ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                    <p className="text-xs text-slate-400 font-normal mb-0.5">From</p>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">
                      {new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs text-slate-400">{fmt12(bk.start_hour)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                    <p className="text-xs text-slate-400 font-normal mb-0.5">To</p>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">
                      {new Date(bk.end_date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs text-slate-400">{fmt12(bk.start_hour)}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                    <p className="text-xs text-slate-400 font-normal mb-0.5">Date</p>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">
                      {new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                    <p className="text-xs text-slate-400 font-normal mb-0.5">Time</p>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">
                      {fmt12(bk.start_hour)}<br />
                      <span className="text-xs text-slate-400">→ {fmt12(bk.start_hour + bk.duration)}</span>
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl px-3 py-2.5 text-center">
                    <p className="text-xs text-slate-400 font-normal mb-0.5">Duration</p>
                    <p className="text-xs font-semibold text-slate-700 leading-tight">{fmtDuration(bk.duration)}</p>
                  </div>
                </div>
              )}

              {/* Customer info */}
              <div className="bg-slate-50 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-normal">Customer</p>
                  <p className="text-xs font-semibold text-slate-800 truncate">{bk.customer_name}</p>
                  <p className="text-xs text-slate-500 font-normal">{bk.persons} pax</p>
                </div>
                {bk.customer_phone && bk.customer_phone !== '—' && (
                  <a href={`https://wa.me/${toWa(bk.customer_phone)}?text=${encodeURIComponent(`Hi ${bk.customer_name}, regarding your rental booking #${String(bk.booking_no).padStart(5, '0')} — just confirming your details. Please let me know if you have any questions!`)}`}
                    target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-[#25D366] active:scale-90 transition shrink-0">
                    <WaIcon className="w-5 h-5" />
                  </a>
                )}
              </div>

              {/* Price breakdown */}
              <div className="flex flex-col gap-1.5 px-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-normal">Rate</span>
                  <span className="font-semibold text-slate-600">RM{Number(priceHour).toFixed(2)} / hour</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-normal">Duration</span>
                  <span className="font-semibold text-slate-600">{bk.duration} hour{bk.duration > 1 ? 's' : ''}</span>
                </div>
                <div className="mt-1 pt-2 border-t border-dashed border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Total</span>
                  <span className="text-base font-black text-amber-500">RM{Number(bk.total_price).toFixed(2)}</span>
                </div>
              </div>

              {/* License document */}
              <div className={`rounded-2xl px-4 py-3 flex items-center justify-between gap-3 ${bk.license_url ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className={`w-4 h-4 shrink-0 ${bk.license_url ? 'text-emerald-500' : 'text-amber-400'}`} />
                  <div>
                    <p className="text-xs font-semibold text-slate-400">Driver's License</p>
                    <p className={`text-xs font-semibold ${bk.license_url ? 'text-emerald-700' : 'text-amber-600'}`}>
                      {bk.license_url ? 'Uploaded ✓' : 'Not yet uploaded'}
                    </p>
                  </div>
                </div>
                {bk.license_url && (
                  <a href={bk.license_url} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl active:scale-95 transition shrink-0">
                    <ExternalLink className="w-3 h-3" /> View
                  </a>
                )}
              </div>

              {/* Notes */}
              {bk.notes && (
                <div className="bg-slate-50 rounded-xl px-3 py-2">
                  <p className="text-xs text-slate-400 font-normal mb-0.5">Note from customer</p>
                  <p className="text-xs text-slate-500 italic">"{bk.notes}"</p>
                </div>
              )}

              {/* Booking ref */}
              <div className="flex items-center gap-1.5 px-1">
                <Hash className="w-3 h-3 text-slate-300" />
                <p className="text-xs text-slate-400 font-mono font-semibold">{String(bk.booking_no).padStart(5, '0')}</p>
                <span className="ml-auto text-xs text-slate-300 font-normal">
                  {new Date(bk.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {/* PDF button — only when confirmed or completed */}
              {(bk.status === 'confirmed' || bk.status === 'completed') && (() => {
                const vehicleName = bk.vehicle_label ?? rentalVehicle?.car_type ?? 'Vehicle';
                const plateColor = rentalVehicle ? `${rentalVehicle.plate_no} · ${rentalVehicle.color}` : '';
                const priceH = rentalVehicle?.price_hour ?? 0;
                const isFullDay = bk.booking_type === 'fullday' && bk.end_date && bk.end_date !== bk.date;
                const dateStr = isFullDay
                  ? `${new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })} – ${new Date(bk.end_date! + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}`
                  : new Date(bk.date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = isFullDay ? '' : `${fmt12(bk.start_hour)} → ${fmt12(bk.start_hour + bk.duration)}`;
                const bookingDate = new Date(bk.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
                const ownerLabel = isAdminForRental && bk.owner_name ? bk.owner_name : (user.name ?? '');

                const row = (label: string, value: string) => `<div class="row"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;
                const daysCount = isFullDay && bk.end_date
                  ? Math.round((new Date(bk.end_date + 'T00:00:00').getTime() - new Date(bk.date + 'T00:00:00').getTime()) / 86400000) + 1
                  : null;
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Gerak Rental Receipt #${String(bk.booking_no).padStart(5, '0')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;background:#fff;display:flex;justify-content:center;padding:32px 16px;font-size:12px;color:#1e293b}
.wrap{width:100%;max-width:400px}
.wordmark{font-size:22px;font-weight:300;letter-spacing:-0.5px;margin-bottom:2px}
.wordmark .a{color:#ef4444}
.subtitle{font-size:10px;color:#64748b;margin-bottom:16px}
hr{border:none;border-top:1px dashed #cbd5e1;margin:12px 0}
.row{display:flex;justify-content:space-between;margin-bottom:5px;gap:8px}
.lbl{color:#64748b;white-space:nowrap}
.val{font-weight:700;text-align:right}
.total-row{display:flex;justify-content:space-between;margin-top:4px}
.total-lbl{font-size:13px;font-weight:700}
.total-val{font-size:20px;font-weight:900}
.footer{margin-top:16px;font-size:9px;color:#94a3b8;text-align:center}
@media print{body{padding:0}}
</style></head><body><div class="wrap">
<div class="wordmark">ger<span class="a">a</span>k</div>
<div class="subtitle">Gerak Rental — Booking Receipt</div>
${row('Booking Ref', `#${String(bk.booking_no).padStart(5, '0')}`)}
${row('Status', bk.status.toUpperCase())}
${row('Booked On', bookingDate)}
<hr/>
${row('Vehicle', vehicleName)}
${plateColor ? row('Plate / Colour', plateColor) : ''}
<hr/>
${row(isFullDay ? 'Date Range' : 'Date', dateStr)}
${timeStr ? row('Time', timeStr) : row('Type', 'Full Day')}
${daysCount ? row('Duration', `${daysCount} day${daysCount > 1 ? 's' : ''}`) : row('Duration', fmtDuration(bk.duration))}
${row('Persons', `${bk.persons} pax`)}
<hr/>
${isFullDay
  ? row('Total', `RM${Number(bk.total_price).toFixed(2)}`)
  : row('Rate', `RM${Number(priceH).toFixed(2)} / hour`) +
    row('Duration', fmtDuration(bk.duration)) +
    `<hr/>`}
<div class="total-row"><span class="total-lbl">Total</span><span class="total-val">RM${Number(bk.total_price).toFixed(2)}</span></div>
<hr/>
${row('Customer', bk.customer_name)}
${bk.customer_phone && bk.customer_phone !== '—' ? row('Phone', bk.customer_phone) : ''}
${row('Vehicle Owner', ownerLabel)}
<div class="footer">Generated by Gerak · ${bookingDate}</div>
</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;

                const handlePdf = () => {
                  const iframe = document.createElement('iframe');
                  iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;visibility:hidden;';
                  document.body.appendChild(iframe);
                  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
                  if (doc) {
                    doc.open(); doc.write(html); doc.close();
                    setTimeout(() => {
                      iframe.contentWindow?.focus();
                      iframe.contentWindow?.print();
                      setTimeout(() => document.body.removeChild(iframe), 1000);
                    }, 300);
                  }
                };
                return (
                  <button onClick={handlePdf}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-slate-100 text-slate-500 text-xs font-semibold py-2.5 rounded-2xl active:scale-95 transition hover:bg-slate-100">
                    <FileDown className="w-3.5 h-3.5" /> Save as PDF
                  </button>
                );
              })()}

              {/* Action buttons */}
              {bk.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { updateBookingStatus(bk.id, 'confirmed'); setRentalReceiptBk(null); }}
                    className="flex-1 bg-emerald-500 text-white text-xs font-semibold py-3 rounded-2xl active:scale-95 transition">
                    Confirm
                  </button>
                  <button onClick={() => { updateBookingStatus(bk.id, 'cancelled'); setRentalReceiptBk(null); }}
                    className="flex-1 bg-red-50 border border-red-200 text-red-500 text-xs font-semibold py-3 rounded-2xl active:scale-95 transition">
                    Decline
                  </button>
                </div>
              )}
              {bk.status === 'confirmed' && (
                <button onClick={() => { updateBookingStatus(bk.id, 'completed'); setRentalReceiptBk(null); }}
                  className="w-full bg-slate-800 text-white text-xs font-semibold py-3 rounded-2xl active:scale-95 transition">
                  Mark Completed
                </button>
              )}

              <div className="pb-2" />
            </div>
          </div>
        </div>
      );
    })()}
  </>
  );
};
