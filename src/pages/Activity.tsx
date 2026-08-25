import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { ClipboardList, Car, KeyRound, GraduationCap, Truck, Repeat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReceiptSheet } from '../components/Receipt';
import {
  buildTransportReceiptRows, buildJubahReceiptRows,
} from '../lib/receiptRows';
import type { ReceiptDoc } from '../lib/receiptRows';
import { generateReceiptPdf } from '../lib/receiptPdf';
import { BOOKING_METHOD_ICON, bookingMethodBadgeClass } from '../lib/bookingMethodIcon';
import { DigitalProfileCard } from '../components/DigitalProfileCard';
import type { DigitalProfileData } from '../components/DigitalProfileCard';
import { getAssignedDriverProfile } from '../lib/assignedDriverProfile';

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
  driverOrderId?: string;
}

// Daily is wired into the type system for a later fast-follow — it has no
// real data source yet, so no loader ever constructs an item with that
// service kind. Record<> (not Partial/switch) means TypeScript itself
// enforces every kind still gets a badge, even ones nothing renders.
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
    const doc = buildTransportReceiptRows(o, { showCreatedTime: true });
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
      driverOrderId: o.driver_id ? o.id : undefined,
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
    const doc = buildTransportReceiptRows(o, { showCreatedTime: true });
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
    .select('id,reference,full_name,ic_number,hp_number,email,university,faculty,matric_id,remark,payment_mode,cost,balance_due,balance_paid,balance_paid_at,initial_paid,initial_paid_at,delivery_address,status,rider_name,created_at')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map(j => {
    const doc = buildJubahReceiptRows({
      reference:   j.reference,
      fullName:    j.full_name,
      icNumber:    j.ic_number,
      hpNumber:    j.hp_number,
      email:       j.email ?? null,
      university:  j.university,
      faculty:     j.faculty,
      matricId:    j.matric_id,
      remark:      j.remark,
      paymentMode: j.payment_mode,
      cost:        Number(j.cost),
      balanceDue:  j.balance_due != null ? Number(j.balance_due) : undefined,
      balancePaid:   j.balance_paid ?? false,
      balancePaidAt: j.balance_paid_at ?? null,
      deliveryAddress: j.delivery_address ?? null,
      status:      j.status,
      initialPaid:   j.initial_paid ?? false,
      initialPaidAt: j.initial_paid_at ?? null,
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
  const [driverProfile, setDriverProfile] = useState<DigitalProfileData | null>(null);

  const openDriverProfile = async (orderId: string) => {
    const profile = await getAssignedDriverProfile(orderId);
    if (profile) setDriverProfile(profile);
  };

  // Driver/rider see their own job history (single service each); everyone
  // else sees the merged customer feed across all four services.
  const effectiveRole = activeRole === 'driver' ? 'driver' : activeRole === 'rider' ? 'rider' : user.role;

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setItems([]); return; }

      if (effectiveRole === 'driver') { setItems(await loadDriverJobItems(authUser.id)); return; }
      if (effectiveRole === 'rider')  { setItems(await loadRiderJobItems(authUser.id));  return; }

      // The customer Activity/My Orders view is specifically the Gerak Car
      // order history. Rental, Jubah and Transporter retain their own service
      // history screens and must not leak into this list.
      setItems(await loadTransportItems(authUser.id));
    })();
  }, [user.name, user.phone, effectiveRole]);

  // BottomNav hides itself while any sheet is open — same convention as MyOrders/DriverHome.
  useEffect(() => {
    if (!activeItem) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [activeItem, setSheetOpen]);

  const pageTitle = effectiveRole === 'driver' || effectiveRole === 'rider' ? 'Activity' : 'My Orders';
  const pageSubtitle =
    effectiveRole === 'driver' ? 'Your driving trips, all in one place' :
    effectiveRole === 'rider'  ? 'Your delivery jobs, all in one place' :
                                 'Your Gerak Car orders, all in one place';

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-4 animate-fade-in">
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-xl font-semibold text-slate-800">{pageTitle}</h2>
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
                                          'Your Gerak Car bookings will appear here.'}
          </p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="px-4 flex flex-col gap-3">
          {items.map(item => {
            const badge = SERVICE_BADGE[item.service];
            const BadgeIcon = badge.icon;
            const method = item.doc.bookingMethod;
            const MethodIcon = method ? BOOKING_METHOD_ICON[method.mode] : null;
            return (
              <div
                key={item.id}
                onClick={() => setActiveItem(item)}
                className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-2 cursor-pointer active:scale-[0.99] transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      <BadgeIcon className="w-3 h-3" />
                      {badge.label}
                    </span>
                    {method && MethodIcon && (
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${bookingMethodBadgeClass(method.mode)}`}>
                        <MethodIcon className="w-3 h-3" />
                        {method.label}
                      </span>
                    )}
                  </div>
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
          onDriverClick={activeItem.driverOrderId ? () => { void openDriverProfile(activeItem.driverOrderId!); } : undefined}
        />
      )}
      {driverProfile && (
        <DigitalProfileCard profile={driverProfile} onClose={() => setDriverProfile(null)} />
      )}
    </div>
  );
};
