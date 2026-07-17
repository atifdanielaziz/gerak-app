import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { ClipboardList, Car, KeyRound, GraduationCap, Truck, Repeat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReceiptSheet } from '../components/Receipt';
import {
  buildTransportReceiptRows, buildRentalReceiptRows, buildJubahReceiptRows,
} from '../lib/receiptRows';
import type { ReceiptDoc } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';

type ServiceKind = 'transport' | 'rental' | 'jubah' | 'transporter' | 'daily';

interface ActivityItem {
  id: string;
  service: ServiceKind;
  createdAt: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusClassName: string;
  amount?: string;
  doc: ReceiptDoc;
}

// Transporter/Daily are wired into the type system for a later fast-follow —
// neither has a real data source yet, so no loader ever constructs an item
// with these service kinds. Record<> (not Partial/switch) means TypeScript
// itself enforces every kind still gets a badge, even ones nothing renders.
const SERVICE_BADGE: Record<ServiceKind, { icon: LucideIcon; label: string }> = {
  transport:   { icon: Car,           label: 'Gerak' },
  rental:      { icon: KeyRound,      label: 'Rental' },
  jubah:       { icon: GraduationCap, label: 'Jubah' },
  transporter: { icon: Truck,         label: 'Transporter' },
  daily:       { icon: Repeat,        label: 'Daily' },
};

async function loadTransportItems(customerId: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('ride_orders')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map(o => {
    const doc = buildTransportReceiptRows(o);
    return {
      id:              `transport-${o.id}`,
      service:         'transport' as const,
      createdAt:       o.created_at,
      title:           o.destination,
      subtitle:        `from ${o.pickup}`,
      statusLabel:     doc.statusLabel,
      statusClassName: doc.statusClassName,
      amount:          o.fare === 'TBC' ? 'TBC' : `RM${(Number(o.fare) + (o.night_charge ?? 0)).toFixed(2)}`,
      doc,
    };
  });
}

async function loadRentalItems(customerId: string, renterName: string, renterPhone: string): Promise<ActivityItem[]> {
  const { data: rows } = await supabase
    .from('rental_bookings')
    .select('*')
    .eq('customer_id', customerId)
    .order('date', { ascending: false })
    .limit(30);
  if (!rows?.length) return [];

  // Same enrichment fan-out as GerakRental.tsx's loadMyBookings — rental_bookings
  // only stores owner_id, no denormalized owner/vehicle fields.
  const ownerIds = [...new Set(rows.map(r => r.owner_id))];
  const [{ data: profiles }, { data: vehicles }] = await Promise.all([
    supabase.from('profiles').select('id, name, gerak_id, phone').in('id', ownerIds),
    supabase.from('rental_vehicles').select('owner_id, car_type, plate_no, color, price_hour').in('owner_id', ownerIds),
  ]);

  const profileById    = new Map(profiles?.map(p => [p.id, p]) ?? []);
  const vehicleByOwner = new Map(vehicles?.map(v => [v.owner_id, v]) ?? []);
  return rows.map(r => {
    const p = profileById.get(r.owner_id);
    const v = vehicleByOwner.get(r.owner_id);
    const bk = {
      ...r,
      start_hour:     Number(r.start_hour),
      duration:       Number(r.duration),
      booking_type:   r.booking_type ?? 'hourly',
      owner_name:     p?.name ?? '—',
      owner_gerak_id: p?.gerak_id ?? '—',
      owner_phone:    p?.phone ?? '',
      car_type:       v?.car_type ?? '—',
      plate_no:       v?.plate_no ?? '—',
      color:          v?.color ?? '—',
      price_hour:     Number(v?.price_hour ?? 0),
      renterName,
      renterPhone,
    };
    const doc = buildRentalReceiptRows(bk);
    return {
      id:              `rental-${r.id}`,
      service:         'rental' as const,
      createdAt:       r.created_at,
      title:           bk.car_type,
      subtitle:        `${bk.plate_no} · ${bk.color}`,
      statusLabel:     doc.statusLabel,
      statusClassName: doc.statusClassName,
      amount:          `RM${Number(r.total_price).toFixed(2)}`,
      doc,
    };
  });
}

async function loadJubahItems(customerId: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('jubah_bookings')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map(j => {
    const doc = buildJubahReceiptRows({
      reference:  j.reference,
      fullName:   j.full_name,
      icNumber:   j.ic_number,
      hpNumber:   j.hp_number,
      university: j.university,
      faculty:    j.faculty,
      matricId:   j.matric_id,
      remark:     j.remark,
      paymentMode: j.payment_mode,
      cost:       Number(j.cost),
      balanceDue: j.balance_due != null ? Number(j.balance_due) : undefined,
      status:     j.status,
      riderName:  j.rider_name,
      riderPhone: null, // no rider_phone column exists on jubah_bookings — not copying that pre-existing mistake here
      createdAt:  j.created_at,
    });
    return {
      id:              `jubah-${j.id}`,
      service:         'jubah' as const,
      createdAt:       j.created_at,
      title:           `${j.remark} Robe Delivery`,
      subtitle:        `${j.matric_id} · ${j.university}`,
      statusLabel:     doc.statusLabel,
      statusClassName: doc.statusClassName,
      amount:          `RM${Number(j.cost).toFixed(2)}`,
      doc,
    };
  });
}

async function loadDriverJobItems(driverId: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('ride_orders')
    .select('id,customer_name,campus,date,time,pickup,destination,passengers,contact,fare,night_charge,notes,status,created_at')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map(o => {
    const doc = buildTransportReceiptRows(o);
    return {
      id:              `transport-${o.id}`,
      service:         'transport' as const,
      createdAt:       o.created_at,
      title:           o.destination,
      subtitle:        `${o.customer_name} · from ${o.pickup}`,
      statusLabel:     doc.statusLabel,
      statusClassName: doc.statusClassName,
      amount:          o.fare === 'TBC' ? 'TBC' : `RM${(Number(o.fare) + (o.night_charge ?? 0)).toFixed(2)}`,
      doc,
    };
  });
}

async function loadRiderJobItems(riderId: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('jubah_bookings')
    .select('id,reference,full_name,ic_number,hp_number,university,faculty,matric_id,remark,payment_mode,cost,balance_due,status,rider_name,created_at')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map(j => {
    const doc = buildJubahReceiptRows({
      reference:   j.reference,
      fullName:    j.full_name,
      icNumber:    j.ic_number,
      hpNumber:    j.hp_number,
      university:  j.university,
      faculty:     j.faculty,
      matricId:    j.matric_id,
      remark:      j.remark,
      paymentMode: j.payment_mode,
      cost:        Number(j.cost),
      balanceDue:  j.balance_due != null ? Number(j.balance_due) : undefined,
      status:      j.status,
      riderName:   j.rider_name,
      riderPhone:  null, // no rider_phone column exists on jubah_bookings
      createdAt:   j.created_at,
    });
    return {
      id:              `jubah-${j.id}`,
      service:         'jubah' as const,
      createdAt:       j.created_at,
      title:           `${j.remark} Robe Delivery`,
      subtitle:        `${j.full_name} · ${j.matric_id}`,
      statusLabel:     doc.statusLabel,
      statusClassName: doc.statusClassName,
      amount:          `RM${Number(j.cost).toFixed(2)}`,
      doc,
    };
  });
}

export const Activity: React.FC = () => {
  const { user, activeRole, setSheetOpen } = useApp();
  const [items, setItems]           = useState<ActivityItem[] | null>(null);
  const [activeItem, setActiveItem] = useState<ActivityItem | null>(null);

  // Driver/rider see their own job history (single service each); everyone
  // else sees the merged customer feed across all three services.
  const effectiveRole = activeRole === 'driver' ? 'driver' : activeRole === 'rider' ? 'rider' : user.role;

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setItems([]); return; }

      if (effectiveRole === 'driver') { setItems(await loadDriverJobItems(authUser.id)); return; }
      if (effectiveRole === 'rider')  { setItems(await loadRiderJobItems(authUser.id));  return; }

      const [transport, rental, jubah] = await Promise.all([
        loadTransportItems(authUser.id),
        loadRentalItems(authUser.id, user.name, user.phone),
        loadJubahItems(authUser.id),
      ]);
      const merged = [...transport, ...rental, ...jubah].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setItems(merged);
    })();
  }, [user.name, user.phone, effectiveRole]);

  // BottomNav hides itself while any sheet is open — same convention as MyOrders/DriverHome.
  useEffect(() => {
    setSheetOpen(!!activeItem);
    return () => setSheetOpen(false);
  }, [activeItem, setSheetOpen]);

  const pageSubtitle =
    effectiveRole === 'driver' ? 'Your driving trips, all in one place' :
    effectiveRole === 'rider'  ? 'Your delivery jobs, all in one place' :
                                 'Your orders across all Gerak services';

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-xl font-semibold text-slate-800">Activity</h2>
        <p className="text-xs text-slate-400 font-normal mt-0.5">{pageSubtitle}</p>
      </div>

      {items === null && (
        <div className="flex items-center justify-center py-20">
          <span className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-8 gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600">No activity yet</p>
          <p className="text-xs text-slate-400 font-normal text-center">
            {effectiveRole === 'driver' ? 'Your accepted and completed trips will appear here.' :
             effectiveRole === 'rider'  ? 'Your Jubah delivery jobs will appear here.' :
                                          'Your bookings across Transport, Rental, and Jubah will appear here.'}
          </p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="px-4 flex flex-col gap-3">
          {items.map(item => {
            const badge = SERVICE_BADGE[item.service];
            const BadgeIcon = badge.icon;
            return (
              <div
                key={item.id}
                onClick={() => setActiveItem(item)}
                className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-2 cursor-pointer active:scale-[0.99] transition"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    <BadgeIcon className="w-3 h-3" />
                    {badge.label}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${item.statusClassName}`}>
                    {item.statusLabel}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                  <p className="text-xs text-slate-400 font-normal truncate mt-0.5">{item.subtitle}</p>
                </div>
                <div className="flex items-center justify-between">
                  {item.amount && <span className="text-sm font-black text-slate-800">{item.amount}</span>}
                  <span className="text-xs text-slate-300 font-normal ml-auto">
                    {new Date(item.createdAt).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeItem && (
        <ReceiptSheet
          doc={activeItem.doc}
          onClose={() => setActiveItem(null)}
          onSavePdf={() => generateReceiptPdf(activeItem.doc)}
        />
      )}
    </div>
  );
};
